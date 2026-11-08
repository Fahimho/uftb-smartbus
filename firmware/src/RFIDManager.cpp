#include "RFIDManager.h"

// The MFRC522 callback API does not support a context parameter.
// This pointer connects the callback to the ResourceManager.
static ResourceManager* rfidResourceManager = nullptr;

// MFRC522 calls this with:
// true  = select RFID (CS LOW)
// false = deselect RFID (CS HIGH)
static void rfidCSCallback(bool active) {
    if (rfidResourceManager != nullptr) {
        rfidResourceManager->setRfidCS(active);
    }
}


RFIDManager::RFIDManager(uint8_t csPin, ResourceManager& rm)
    : mfrc522(csPin, UINT8_MAX),
      resMgr(rm) {
}


bool RFIDManager::begin() {

    Serial.println("[RFID] Initializing MFRC522 with MCP23017 CS...");

    _connected = false;

    if (!resMgr.isMcpConnected()) {
        Serial.println("[ERROR] MCP23017 not connected.");
        return false;
    }

    // Connect the callback to the ResourceManager.
    rfidResourceManager = &resMgr;

    // Acquire shared SPI mutex.
    if (!resMgr.acquireSPI("RFID_INIT")) {
        Serial.println("[ERROR] Could not acquire SPI bus.");
        return false;
    }

    // Register callbacks BEFORE PCD_Init().
    mfrc522.setChipSelectCallback(
        rfidCSCallback,
        rfidCSCallback
    );

    // Initialize MFRC522.
    mfrc522.PCD_Init();

    delay(50);

    // Read MFRC522 version register.
    byte version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);

    Serial.print("[RFID] MFRC522 Version: 0x");
    Serial.println(version, HEX);

    // Always release SPI after initialization.
    resMgr.releaseSPI("RFID_INIT");

    if (version == 0x00 || version == 0xFF) {
        Serial.println("[ERROR] MFRC522 communication failed.");
        Serial.println("[RFID] Check SPI wiring and MCP23017 CS.");
        return false;
    }

    _connected = true;

    Serial.println("[OK] MFRC522 initialized successfully.");
    Serial.println("[RFID] CS controlled by MCP23017 GPA5.");

    return true;
}


bool RFIDManager::isConnected() {
    return _connected;
}


bool RFIDManager::scan() {

    if (!_connected) {
        return false;
    }

    if (!resMgr.acquireSPI("RFID")) {
        return false;
    }

    bool found = false;

    if (mfrc522.PICC_IsNewCardPresent() &&
        mfrc522.PICC_ReadCardSerial()) {

        _lastUID = "";

        for (byte i = 0; i < mfrc522.uid.size; i++) {

            if (mfrc522.uid.uidByte[i] < 0x10) {
                _lastUID += "0";
            }

            _lastUID += String(
                mfrc522.uid.uidByte[i],
                HEX
            );
        }

        _lastUID.toUpperCase();

        found = true;

        // Finish communication with the card.
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();
    }

    resMgr.releaseSPI("RFID");

    return found;
}


String RFIDManager::getLastUID() {
    return _lastUID;
}