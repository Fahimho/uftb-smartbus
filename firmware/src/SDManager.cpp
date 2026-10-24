#include "SDManager.h"

SDManager::SDManager(uint8_t csPin, ResourceManager& rm) 
    : csPin(csPin), resourceManager(rm) {
    connected = false;
}

bool SDManager::begin() {
    if (!resourceManager.acquireSPI("SD_Init")) return false;
    
    connected = SD.begin(csPin);
    
    resourceManager.releaseSPI("SD_Init");
    return connected;
}

bool SDManager::writeLog(String message) {
    if (!connected) return false;

    if (!resourceManager.acquireSPI("SD_Write")) return false;

    File file = SD.open("/log.txt", FILE_APPEND);
    bool success = false;
    if (file) {
        file.println(message);
        file.close();
        success = true;
    }

    resourceManager.releaseSPI("SD_Write");
    return success;
}