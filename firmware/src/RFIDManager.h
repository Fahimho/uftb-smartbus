#pragma once
#include <Arduino.h>
#include <MFRC522.h>
#include "ResourceManager.h"

class RFIDManager {
public:
    RFIDManager(uint8_t rstPin, ResourceManager& rm);
    bool begin();
    bool scan();
    bool isConnected() const { return connected; }
    String getLastUID() const { return lastUID; }

private:
    MFRC522 mfrc522;
    ResourceManager& resourceManager;
    bool connected;
    String lastUID;
};