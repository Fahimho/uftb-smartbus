#include "RFIDManager.h"

// We pass 0 for CS (because we manually control it via MCP23008)
// We pass UINT8_MAX (255) for RST because your RST is hardwired to 3.3V
RFIDManager::RFIDManager(uint8_t rstPin, ResourceManager& rm) 
    : mfrc522(0, UINT8_MAX), resourceManager(rm) {
    connected = false;
}

bool RFIDManager::begin() {
    if (!resourceManager.isMcpConnected()) return false;
    if (!resourceManager.acquireSPI("RFID_Init")) return false;
    
    // Turn on RFID CS via MCP23008
    resourceManager.setRfidCS(true);
    delay(10);
    
    mfrc522.PCD_Init();
    byte version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);
    
    // Turn off RFID CS
    resourceManager.setRfidCS(false);
    resourceManager.releaseSPI("RFID_Init");

    if (version == 0x00 || version == 0xFF) {
        connected = false;
        return false;
    }
    
    connected = true;
    return true;
}

bool RFIDManager::scan() {
    if (!connected) return false;
    if (!resourceManager.acquireSPI("RFID_Scan")) return false;

    // Turn on RFID CS
    resourceManager.setRfidCS(true);
    delay(1);

    bool cardRead = false;
    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        lastUID = "";
        for (byte i = 0; i < mfrc522.uid.size; i++) {
            if(mfrc522.uid.uidByte[i] < 0x10) lastUID += "0";
            lastUID += String(mfrc522.uid.uidByte[i], HEX);
        }
        lastUID.toUpperCase();
        mfrc522.PICC_HaltA();
        cardRead = true;
    }

    // Turn off RFID CS
    resourceManager.setRfidCS(false);
    resourceManager.releaseSPI("RFID_Scan");
    return cardRead;
}