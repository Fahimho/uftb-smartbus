#pragma once
#include <Arduino.h>
#include <SD.h>
#include "ResourceManager.h"

class SDManager {
public:
    SDManager(uint8_t csPin, ResourceManager& rm);
    bool begin();
    bool writeLog(String message);
    bool isConnected() const { return connected; }

private:
    uint8_t csPin;
    ResourceManager& resourceManager;
    bool connected;
};