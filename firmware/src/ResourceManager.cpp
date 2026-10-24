#include "ResourceManager.h"

ResourceManager::ResourceManager() {
    currentOwner = "None";
    spiMutex = xSemaphoreCreateMutex();
    mcpConnected = false;
}

void ResourceManager::begin() {
    if (spiMutex == NULL) {
        Serial.println("[FATAL] Could not create SPI Mutex!");
    }
    
    // Initialize MCP23008 at 0x20
    if (mcp.begin_I2C(0x20)) {
        mcpConnected = true;
        // GP5 is the RFID CS pin (Output)
        mcp.pinMode(5, OUTPUT);
        mcp.digitalWrite(5, HIGH); // Default inactive
        Serial.println("[OK] MCP23008 found. RFID CS mapped to GP5.");
    } else {
        mcpConnected = false;
        Serial.println("[WARNING] MCP23008 NOT found. RFID CS will fail.");
    }
}

bool ResourceManager::isMcpConnected() {
    return mcpConnected;
}

void ResourceManager::setRfidCS(bool active) {
    if (mcpConnected) {
        // RFID CS is active LOW
        mcp.digitalWrite(5, active ? LOW : HIGH);
    }
}

bool ResourceManager::acquireSPI(const char* requester) {
    if (xSemaphoreTake(spiMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        currentOwner = requester;
        return true;
    }
    Serial.printf("[WARN] Resource Manager: %s timed out waiting for SPI bus\n", requester);
    return false;
}

void ResourceManager::releaseSPI(const char* requester) {
    if (currentOwner == requester) {
        currentOwner = "None";
        xSemaphoreGive(spiMutex);
    }
}

const char* ResourceManager::getCurrentOwner() {
    return currentOwner;
}