#include "ResourceManager.h"

ResourceManager::ResourceManager() {
    currentOwner = "None";
    spiMutex = nullptr;
    mcpConnected = false;
}

void ResourceManager::begin() {

    // 1. Initialize SPI mutex
    if (spiMutex == nullptr) {
        spiMutex = xSemaphoreCreateMutex();

        if (spiMutex == nullptr) {
            Serial.println("[FATAL] Could not create SPI Mutex!");
        }
    }

    // 2. Initialize I2C
    Wire.begin(5, 6);
    Wire.setClock(100000);

    delay(100);

    // 3. Initialize MCP23017
    if (mcp.begin_I2C(0x20)) {

        mcpConnected = true;

        Serial.println("[ResourceManager] MCP23017 initialized at 0x20");

        // Emergency button
        mcp.pinMode(0, INPUT_PULLUP);

        // Navigation buttons
        mcp.pinMode(1, INPUT_PULLUP);
        mcp.pinMode(2, INPUT_PULLUP);
        mcp.pinMode(3, INPUT_PULLUP);

        // Buzzer
        mcp.pinMode(4, OUTPUT);
        mcp.digitalWrite(4, LOW);

        // RFID Chip Select
        mcp.pinMode(5, OUTPUT);
        mcp.digitalWrite(5, HIGH);

    } else {

        mcpConnected = false;

        Serial.println("[ERROR] MCP23017 NOT found at 0x20!");
    }

    Serial.println("[ResourceManager] Initialization complete.");
}

bool ResourceManager::isMcpConnected() {
    return mcpConnected;
}

// --------------------------------------------------
// MCP23017 SAFE ACCESS
// --------------------------------------------------

void ResourceManager::pinModeMCP(uint8_t pin, uint8_t mode) {

    if (mcpConnected) {
        mcp.pinMode(pin, mode);
    }
}

void ResourceManager::digitalWriteMCP(uint8_t pin, uint8_t value) {

    if (mcpConnected) {
        mcp.digitalWrite(pin, value);
    }
}

bool ResourceManager::digitalReadMCP(uint8_t pin) {

    if (mcpConnected) {
        return mcp.digitalRead(pin) == HIGH;
    }

    return HIGH;
}

// --------------------------------------------------
// RFID CHIP SELECT
// --------------------------------------------------

void ResourceManager::setRfidCS(bool active) {

    if (!mcpConnected) {
        return;
    }

    // Active LOW
    mcp.digitalWrite(5, active ? LOW : HIGH);
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

        currentOwner = String(requester);

        return true;
    }

    Serial.printf(
        "[WARN] %s timed out waiting for SPI bus.\n",
        requester
    );

    return false;
}

void ResourceManager::releaseSPI(const char* requester) {

    if (spiMutex == nullptr) {
        return;
    }

    if (currentOwner.equals(String(requester))) {

        currentOwner = "None";

        xSemaphoreGive(spiMutex);
    }
}

String ResourceManager::getCurrentOwner() {

    return currentOwner;
}