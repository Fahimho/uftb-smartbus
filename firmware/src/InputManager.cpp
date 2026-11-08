#include "InputManager.h"
#include <Wire.h>

InputManager::InputManager(ResourceManager& rm) : resMgr(rm) {
    mcpConnected = false;
}

bool InputManager::begin() {
    Serial.println("[InputManager] Checking MCP23017...");
    
    if (!resMgr.isMcpConnected()) {
        Serial.println("[ERROR] MCP23017 not initialized by ResourceManager!");
        mcpConnected = false;
        return false;
    }

    mcpConnected = true;

    // Configure pins via ResourceManager
    resMgr.pinModeMCP(0, INPUT_PULLUP); // Emergency
    resMgr.pinModeMCP(1, INPUT_PULLUP); // UP
    resMgr.pinModeMCP(2, INPUT_PULLUP); // DOWN
    resMgr.pinModeMCP(3, INPUT_PULLUP); // SELECT
    resMgr.pinModeMCP(4, OUTPUT);       // Buzzer
    resMgr.digitalWriteMCP(4, LOW);

    Serial.println("[OK] InputManager configured.");
    return true;
}

bool InputManager::isEmergencyPressed() {
    return mcpConnected && (resMgr.digitalReadMCP(0) == false); // false = LOW = pressed
}

bool InputManager::isUpPressed() {
    return mcpConnected && (resMgr.digitalReadMCP(1) == false);
}

bool InputManager::isDownPressed() {
    return mcpConnected && (resMgr.digitalReadMCP(2) == false);
}

bool InputManager::isSelectPressed() {
    return mcpConnected && (resMgr.digitalReadMCP(3) == false);
}

void InputManager::buzz(int durationMs) {
    if (!mcpConnected) return;
    resMgr.digitalWriteMCP(4, HIGH);
    delay(durationMs);
    resMgr.digitalWriteMCP(4, LOW);
}