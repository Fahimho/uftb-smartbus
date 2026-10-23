#pragma once
#include <Arduino.h>
#include <MFRC522.h>
#include "ResourceManager.h"

class RFIDManager {
public:
    RFIDManager(uint8_t csPin, uint8_t rstPin, ResourceManager& rm);
    bool begin();
    void scan();
    bool isConnected() const { return connected; }

private:
    MFRC522 mfrc522;
    ResourceManager& resourceManager;
    bool connected;
};