#include "RFIDManager.h"

RFIDManager::RFIDManager(uint8_t csPin, uint8_t rstPin, ResourceManager& rm) 
    : mfrc522(csPin, rstPin), resourceManager(rm) {
    connected = false;
}

bool RFIDManager::begin() {
    if (!resourceManager.acquireSPI("RFID")) return false;
    
    mfrc522.PCD_Init();
    byte version = mfrc522.PCD_ReadRegister(MFRC522::VersionReg);
    
    resourceManager.releaseSPI("RFID");

    if (version == 0x00 || version == 0xFF) {
        connected = false;
        return false;
    }
    
    connected = true;
    return true;
}

void RFIDManager::scan() {
    if (!connected) return;

    // Acquire the bus before scanning
    if (!resourceManager.acquireSPI("RFID")) return;

    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        Serial.print("[RFID] Card detected! UID: ");
        for (byte i = 0; i < mfrc522.uid.size; i++) {
            Serial.print(mfrc522.uid.uidByte[i] < 0x10 ? " 0" : " ");
            Serial.print(mfrc522.uid.uidByte[i], HEX);
        }
        Serial.println();
        mfrc522.PICC_HaltA();
    }

    // Always release the bus when done
    resourceManager.releaseSPI("RFID");
}