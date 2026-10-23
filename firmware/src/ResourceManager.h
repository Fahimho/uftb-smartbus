#pragma once
#include <Arduino.h>

class ResourceManager {
public:
    ResourceManager();
    void begin();
    
    // Call this before talking to RFID or SD
    bool acquireSPI(const char* requester);
    
    // Call this when done
    void releaseSPI(const char* requester);
    
    const char* getCurrentOwner();

private:
    SemaphoreHandle_t spiMutex;
    const char* currentOwner;
};