#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

// ---------------------------------------------------------------------------
// ResourceManager: owner of the shared buses.
//
//   I2C  (Wire, SDA=GPIO5 SCL=GPIO6): OLED 0x3C/0x3D + MCP23017 0x20
//        -> ONE mutex (lockI2C/unlockI2C). Every Wire user must hold it for the
//           whole transaction (the OLED push in main.cpp, every MCP access here).
//   SPI  (SCK=7 MISO=8 MOSI=9):        MFRC522 (CS = MCP23017 GPA5) + microSD (GPIO21)
//        -> spiMutex (acquireSPI/releaseSPI).
//
// LOCK ORDER (deadlock rule): SPI mutex  ->  I2C mutex.  Code holding the I2C
// mutex must never wait for the SPI mutex.  (The RFID chip-select callback takes
// the I2C mutex while the RFID driver already holds the SPI mutex; that is the
// only nesting and it follows this order.)
//
// The MCP23017 is driven directly (no Adafruit_MCP23X17): reads/writes are single,
// error-checked transactions, outputs are kept in a shadow register, and a failed
// read is reported as a failure, never as "button released".
// ---------------------------------------------------------------------------

// MCP23017 port-A bit assignments (unchanged hardware map)
#define MCP_PIN_EMERGENCY 0
#define MCP_PIN_UP        1
#define MCP_PIN_DOWN      2
#define MCP_PIN_SELECT    3
#define MCP_PIN_BUZZER    4
#define MCP_PIN_RFID_CS   5

struct I2CStats {
    uint32_t lockTimeouts;
    uint32_t mcpReadFail;
    uint32_t mcpWriteFail;
    uint32_t mcpReconfig;
};

class ResourceManager {
public:
    ResourceManager();

    void begin();

    // ---- I2C bus lock (bounded wait, NOT recursive) ----
    bool lockI2C(uint32_t timeoutMs = 250);
    void unlockI2C();

    // ---- SPI bus lock ----
    bool acquireSPI(const char* requester, uint32_t timeoutMs = 1000);
    void releaseSPI(const char* requester);   // only the task that took it can release
    String getCurrentOwner();

    // ---- MCP23017 ----
    bool isMcpConnected();

    // One I2C read of GPIOA. Returns false on bus error (value then untouched).
    bool readButtons(uint8_t& gpioa);

    // Re-reads IODIRA/GPPUA/OLATA and re-applies the configuration if the chip
    // lost it (brown-out glitch, reset). Returns false on bus error.
    bool verifyMcpConfig();

    // Outputs (shadow-register based, one write each)
    void setRfidCS(bool active);              // active = CS LOW
    bool setBuzzer(bool on);

    // Compatibility wrappers (only outputs GPA4 / GPA5 are writable)
    void pinModeMCP(uint8_t pin, uint8_t mode);       // no-op: direction is set centrally
    void digitalWriteMCP(uint8_t pin, uint8_t value);
    bool digitalReadMCP(uint8_t pin);                 // true = HIGH; HIGH also on error

    I2CStats getI2CStats();

private:
    SemaphoreHandle_t spiMutex;
    SemaphoreHandle_t i2cMutex;
    const char* volatile currentOwner;

    bool mcpConnected;
    uint8_t olatShadow;                       // protected by the I2C mutex

    I2CStats stats;

    // The helpers below REQUIRE the caller to hold the I2C mutex.
    bool mcpWrite(uint8_t reg, uint8_t value);
    bool mcpRead(uint8_t reg, uint8_t& value);
    bool mcpApplyConfig();
    bool setOutputBit(uint8_t pin, bool high);
};
