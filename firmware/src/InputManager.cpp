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

    resMgr.pinModeMCP(0, INPUT_PULLUP); // Emergency
    resMgr.pinModeMCP(1, INPUT_PULLUP); // UP
    resMgr.pinModeMCP(2, INPUT_PULLUP); // DOWN
    resMgr.pinModeMCP(3, INPUT_PULLUP); // SELECT
    resMgr.pinModeMCP(4, OUTPUT);       // Buzzer
    resMgr.digitalWriteMCP(4, LOW);

    Serial.println("[OK] InputManager configured.");
    return true;
}

// Helper to read pin with debounce
static bool debounce(ResourceManager& resMgr, bool& lastState, int pin) {
    bool currentRaw = resMgr.digitalReadMCP(pin); // true = HIGH (released), false = LOW (pressed)
    bool isPressed = !currentRaw; // true if pressed

    // Only register a change if the state has been stable for > 20ms
    static unsigned long lastPinChangeTime[5] = {0};
    static bool lastStableState[5] = {false};

    if (isPressed != lastStableState[pin]) {
        if (millis() - lastPinChangeTime[pin] > 20) {
            lastStableState[pin] = isPressed;
            lastPinChangeTime[pin] = millis();
        }
    }

    // Return the stable state (edge detection)
    bool pressedEvent = (lastStableState[pin] && !lastState);
    lastState = lastStableState[pin];
    return pressedEvent;
}

bool InputManager::isEmergencyPressed() {
    if (!mcpConnected) return false;
    return debounce(resMgr, _lastEmergency, 0);
}

bool InputManager::isEmergencyHeld() {
    if (!mcpConnected) return false;
    return resMgr.digitalReadMCP(0) == false;
}

bool InputManager::isUpPressed() {
    if (!mcpConnected) return false;
    return debounce(resMgr, _lastUp, 1);
}

bool InputManager::isDownPressed() {
    if (!mcpConnected) return false;
    return debounce(resMgr, _lastDown, 2);
}

bool InputManager::isSelectPressed() {
    if (!mcpConnected) return false;
    return debounce(resMgr, _lastSelect, 3);
}

// NEW: raw SELECT pin state (no debounce, no edge).
// Mirrors isEmergencyHeld(). Used by buttonTask to time the SELECT hold.
bool InputManager::isSelectHeld() {
    if (!mcpConnected) return false;
    return resMgr.digitalReadMCP(3) == false;
}

void InputManager::buzz(int durationMs) {
    if (!mcpConnected) return;
    resMgr.digitalWriteMCP(4, HIGH);
    delay(durationMs);
    resMgr.digitalWriteMCP(4, LOW);
}