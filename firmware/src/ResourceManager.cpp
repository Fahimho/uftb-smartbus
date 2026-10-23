#include "ResourceManager.h"

ResourceManager::ResourceManager() {
    currentOwner = "None";
    spiMutex = xSemaphoreCreateMutex();
}

void ResourceManager::begin() {
    if (spiMutex == NULL) {
        Serial.println("[FATAL] Could not create SPI Mutex!");
    }
}

bool ResourceManager::acquireSPI(const char* requester) {
    // Wait up to 100ms to get the mutex
    if (xSemaphoreTake(spiMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        currentOwner = requester;
        return true;
    }
    Serial.printf("[WARN] Resource Manager: %s timed out waiting for SPI bus (Owner: %s)\n", requester, currentOwner);
    return false;
}

void ResourceManager::releaseSPI(const char* requester) {
    if (currentOwner == requester) {
        currentOwner = "None";
        xSemaphoreGive(spiMutex);
    } else {
        Serial.printf("[ERROR] Resource Manager: %s tried to release SPI, but doesn't own it!\n", requester);
    }
}

const char* ResourceManager::getCurrentOwner() {
    return currentOwner;
}