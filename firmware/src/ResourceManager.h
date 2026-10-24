#pragma once
#include <Arduino.h>
#include <Adafruit_MCP23X08.h>

class ResourceManager {
public:
    ResourceManager();
    void begin();
    
    bool acquireSPI(const char* requester);
    void releaseSPI(const char* requester);
    const char* getCurrentOwner();

    // New: Control MCP23008 GP5 for RFID CS
    void setRfidCS(bool active);
    bool isMcpConnected();

private:
    SemaphoreHandle_t spiMutex;
    const char* currentOwner;
    Adafruit_MCP23X08 mcp;
    bool mcpConnected;
};