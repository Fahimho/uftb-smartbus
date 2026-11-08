#pragma once

#include <Arduino.h>
#include <MFRC522.h>
#include "ResourceManager.h"

class RFIDManager {

public:

    // Constructor
    // csPin: Native CS pin placeholder (external CS is MCP23017 GPA5)
    RFIDManager(uint8_t csPin, ResourceManager& rm);

    // Initialize RFID reader
    bool begin();

    // Scan for an RFID card
    bool scan();

    // Check RFID connection status
    bool isConnected();

    // Get the last scanned card UID
    String getLastUID();


private:

    // MFRC522 instance
    MFRC522 mfrc522;

    // Shared ResourceManager instance
    ResourceManager& resMgr;

    // RFID connection status
    bool _connected = false;

    // Last scanned RFID UID
    String _lastUID = "";

};