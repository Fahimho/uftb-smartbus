#include "ResourceManager.h"

// MCP23017 register map (IOCON.BANK = 0, power-on default)
static const uint8_t MCP_ADDR       = 0x20;
static const uint8_t REG_IODIRA     = 0x00;
static const uint8_t REG_IPOLA      = 0x02;
static const uint8_t REG_GPPUA      = 0x0C;
static const uint8_t REG_GPIOA      = 0x12;
static const uint8_t REG_OLATA      = 0x14;

// GPA0-3 inputs (buttons), GPA4-5 outputs (buzzer, RFID CS), GPA6-7 inputs.
static const uint8_t IODIRA_VALUE   = 0xCF;
// Pull-ups on the four buttons (active LOW).
static const uint8_t GPPUA_VALUE    = 0x0F;
// Idle output levels: buzzer LOW (off), RFID CS HIGH (deselected).
static const uint8_t OLATA_IDLE     = (1 << MCP_PIN_RFID_CS);

ResourceManager::ResourceManager() {
    spiMutex = nullptr;
    i2cMutex = nullptr;
    currentOwner = "None";
    mcpConnected = false;
    olatShadow = OLATA_IDLE;
    stats = {0, 0, 0, 0};
}

void ResourceManager::begin() {

    // 1. Mutexes
    if (spiMutex == nullptr) {
        spiMutex = xSemaphoreCreateMutex();
        if (spiMutex == nullptr) {
            Serial.println("[FATAL] Could not create SPI Mutex!");
        }
    }
    if (i2cMutex == nullptr) {
        i2cMutex = xSemaphoreCreateMutex();
        if (i2cMutex == nullptr) {
            Serial.println("[FATAL] Could not create I2C Mutex!");
        }
    }

    // 2. I2C (pins unchanged: SDA=5, SCL=6)
    Wire.begin(5, 6);
    Wire.setClock(400000);

    delay(100);

    // 3. MCP23017: probe (a few tries), configure, read back.
    bool present = false;
    for (int attempt = 0; attempt < 3 && !present; attempt++) {
        if (lockI2C(250)) {
            Wire.beginTransmission(MCP_ADDR);
            present = (Wire.endTransmission() == 0);
            unlockI2C();
        }
        if (!present) delay(20);
    }

    if (!present) {
        mcpConnected = false;
        Serial.println("[ERROR] MCP23017 NOT found at 0x20!");
    } else {
        mcpConnected = true;
        bool ok = false;
        if (lockI2C(250)) {
            olatShadow = OLATA_IDLE;
            ok = mcpApplyConfig();
            unlockI2C();
        }
        if (ok) {
            Serial.println("[ResourceManager] MCP23017 initialized at 0x20 (config verified)");
        } else {
            Serial.println("[ERROR] MCP23017 answered at 0x20 but configuration read-back FAILED (will retry in input task)");
        }
    }

    Serial.println("[ResourceManager] Initialization complete.");
}

// --------------------------------------------------
// I2C LOCK
// --------------------------------------------------

bool ResourceManager::lockI2C(uint32_t timeoutMs) {
    if (i2cMutex == nullptr) {
        return true;    // before begin(): single-threaded boot, nothing to protect
    }
    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(timeoutMs)) == pdTRUE) {
        return true;
    }
    stats.lockTimeouts++;
    return false;
}

void ResourceManager::unlockI2C() {
    if (i2cMutex != nullptr) {
        xSemaphoreGive(i2cMutex);
    }
}

// --------------------------------------------------
// MCP23017 LOW LEVEL (caller holds the I2C mutex)
// --------------------------------------------------

bool ResourceManager::mcpWrite(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(MCP_ADDR);
    Wire.write(reg);
    Wire.write(value);
    bool ok = (Wire.endTransmission() == 0);
    if (!ok) stats.mcpWriteFail++;
    return ok;
}

bool ResourceManager::mcpRead(uint8_t reg, uint8_t& value) {
    Wire.beginTransmission(MCP_ADDR);
    Wire.write(reg);
    // endTransmission(false) keeps the Wire driver lock until requestFrom() returns
    Wire.endTransmission(false);
    size_t got = Wire.requestFrom((uint16_t)MCP_ADDR, (size_t)1, true);
    if (got != 1 || Wire.available() < 1) {
        // drain anything left so the next transaction starts clean
        while (Wire.available()) Wire.read();
        stats.mcpReadFail++;
        return false;
    }
    value = (uint8_t)Wire.read();     // read while the I2C mutex is still held
    return true;
}

// Writes the full configuration (output latch FIRST so the CS line never glitches LOW)
// and verifies it by reading it back.
bool ResourceManager::mcpApplyConfig() {
    if (!mcpWrite(REG_OLATA, olatShadow)) return false;
    if (!mcpWrite(REG_IPOLA, 0x00))       return false;   // no polarity inversion
    if (!mcpWrite(REG_GPPUA, GPPUA_VALUE)) return false;
    if (!mcpWrite(REG_IODIRA, IODIRA_VALUE)) return false;

    uint8_t dir = 0, pu = 0, lat = 0;
    if (!mcpRead(REG_IODIRA, dir)) return false;
    if (!mcpRead(REG_GPPUA, pu))   return false;
    if (!mcpRead(REG_OLATA, lat))  return false;
    return (dir == IODIRA_VALUE) && (pu == GPPUA_VALUE) && (lat == olatShadow);
}

bool ResourceManager::setOutputBit(uint8_t pin, bool high) {
    if (!mcpConnected) return false;
    if (!lockI2C(250)) return false;

    if (high) olatShadow |= (1 << pin);
    else      olatShadow &= ~(1 << pin);

    bool ok = mcpWrite(REG_OLATA, olatShadow);
    unlockI2C();
    return ok;      // on failure the shadow keeps the wanted level; verifyMcpConfig() re-applies it
}

// --------------------------------------------------
// MCP23017 PUBLIC
// --------------------------------------------------

bool ResourceManager::isMcpConnected() {
    return mcpConnected;
}

bool ResourceManager::readButtons(uint8_t& gpioa) {
    if (!mcpConnected) return false;
    if (!lockI2C(100)) return false;
    uint8_t v = 0;
    bool ok = mcpRead(REG_GPIOA, v);
    unlockI2C();
    if (ok) gpioa = v;
    return ok;
}

bool ResourceManager::verifyMcpConfig() {
    if (!mcpConnected) return false;
    if (!lockI2C(250)) return false;

    uint8_t dir = 0, pu = 0, lat = 0;
    bool ok = mcpRead(REG_IODIRA, dir) && mcpRead(REG_GPPUA, pu) && mcpRead(REG_OLATA, lat);
    if (ok && (dir != IODIRA_VALUE || pu != GPPUA_VALUE || lat != olatShadow)) {
        Serial.printf("[MCP] config mismatch (IODIRA=0x%02X GPPUA=0x%02X OLATA=0x%02X) -> re-applying\n",
                      dir, pu, lat);
        stats.mcpReconfig++;
        ok = mcpApplyConfig();
    }
    unlockI2C();
    return ok;
}

void ResourceManager::setRfidCS(bool active) {
    // Active LOW. Called by the MFRC522 chip-select callback while the SPI mutex is held.
    setOutputBit(MCP_PIN_RFID_CS, !active);
}

bool ResourceManager::setBuzzer(bool on) {
    bool ok = setOutputBit(MCP_PIN_BUZZER, on);
    if (!ok && !on) {
        // never leave the buzzer latched ON because of one failed write
        for (int i = 0; i < 2 && !ok; i++) ok = setOutputBit(MCP_PIN_BUZZER, false);
    }
    return ok;
}

void ResourceManager::pinModeMCP(uint8_t pin, uint8_t mode) {
    // Direction / pull-ups are configured centrally (mcpApplyConfig). Kept for API compatibility.
    (void)pin; (void)mode;
}

void ResourceManager::digitalWriteMCP(uint8_t pin, uint8_t value) {
    // GPA4 (buzzer) is deliberately NOT writable here: Buzzer.cpp is its only owner.
    if (pin == MCP_PIN_RFID_CS) {
        setOutputBit(MCP_PIN_RFID_CS, value != LOW);
    }
    // other pins are inputs: ignored
}

bool ResourceManager::digitalReadMCP(uint8_t pin) {
    uint8_t v;
    if (pin < 8 && readButtons(v)) {
        return (v & (1 << pin)) != 0;
    }
    return true;    // error -> report HIGH; callers that care use readButtons()
}

I2CStats ResourceManager::getI2CStats() {
    return stats;
}

// --------------------------------------------------
// SPI RESOURCE MANAGEMENT
// --------------------------------------------------

bool ResourceManager::acquireSPI(const char* requester, uint32_t timeoutMs) {

    if (spiMutex == nullptr) {
        Serial.println("[ERROR] SPI mutex not initialized!");
        return false;
    }

    if (xSemaphoreTake(spiMutex, pdMS_TO_TICKS(timeoutMs)) == pdTRUE) {
        currentOwner = requester;   // string literals at every call site
        return true;
    }

    Serial.printf("[WARN] %s timed out waiting for SPI bus (owner: %s).\n",
                  requester, currentOwner);
    return false;
}

void ResourceManager::releaseSPI(const char* requester) {

    if (spiMutex == nullptr) {
        return;
    }

    // Only the task that holds the mutex may release it (the old code compared the
    // requester string and silently leaked the mutex on a mismatch).
    if (xSemaphoreGetMutexHolder(spiMutex) == xTaskGetCurrentTaskHandle()) {
        currentOwner = "None";
        xSemaphoreGive(spiMutex);
    } else {
        Serial.printf("[WARN] %s tried to release the SPI bus without owning it.\n", requester);
    }
}

String ResourceManager::getCurrentOwner() {
    return String(currentOwner);
}
