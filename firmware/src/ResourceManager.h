#pragma once

#include <Arduino.h>
#include <Adafruit_MCP23X17.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

class ResourceManager {
public:
    ResourceManager();

    void begin();

    // SPI Bus Mutex (for shared SPI between SD and RFID)
    bool acquireSPI(const char* requester, uint32_t timeoutMs = 1000);
    void releaseSPI(const char* requester);
    String getCurrentOwner();

    // MCP23017 I2C Expander (shared by Input and RFID CS)
    void setRfidCS(bool active);
    bool isMcpConnected();
    
    // Expose safe read/write so InputManager doesn't need Wire.begin()
    void pinModeMCP(uint8_t pin, uint8_t mode);
    void digitalWriteMCP(uint8_t pin, uint8_t value);
    bool digitalReadMCP(uint8_t pin);

private:
    SemaphoreHandle_t spiMutex;
    String currentOwner;

    Adafruit_MCP23X17 mcp;
    bool mcpConnected;
};