#include "InputManager.h"
#include <Wire.h>

InputManager::InputManager(uint8_t sda, uint8_t scl) {
    mcpConnected = false;
}

bool InputManager::begin() {
    // 1. Try to connect to MCP23008 at 0x20
    if (mcp.begin_I2C(0x20)) {
        mcpConnected = true;
        // Configure pins as inputs with pull-ups
        mcp.pinMode(0, INPUT_PULLUP); // Emergency
        mcp.pinMode(1, INPUT_PULLUP); // Up
        mcp.pinMode(2, INPUT_PULLUP); // Down
        mcp.pinMode(3, INPUT_PULLUP); // Select
        mcp.pinMode(4, OUTPUT);       // Buzzer
        Serial.println("[OK] MCP23008 found. Using expander for buttons/buzzer.");
    } else {
        mcpConnected = false;
        Serial.println("[WARNING] MCP23008 NOT found. Falling back to native ESP32 pins.");
        
        // Setup native ESP32 pins
        pinMode(PIN_EMERGENCY, INPUT_PULLUP);
        pinMode(PIN_UP, INPUT_PULLUP);
        pinMode(PIN_DOWN, INPUT_PULLUP);
        pinMode(PIN_SELECT, INPUT_PULLUP);
        pinMode(PIN_BUZZER, OUTPUT);
        digitalWrite(PIN_BUZZER, LOW);
    }
    return mcpConnected;
}

bool InputManager::isEmergencyPressed() {
    if (mcpConnected) return mcp.digitalRead(0) == LOW;
    return digitalRead(PIN_EMERGENCY) == LOW;
}

bool InputManager::isUpPressed() {
    if (mcpConnected) return mcp.digitalRead(1) == LOW;
    return digitalRead(PIN_UP) == LOW;
}

bool InputManager::isDownPressed() {
    if (mcpConnected) return mcp.digitalRead(2) == LOW;
    return digitalRead(PIN_DOWN) == LOW;
}

bool InputManager::isSelectPressed() {
    if (mcpConnected) return mcp.digitalRead(3) == LOW;
    return digitalRead(PIN_SELECT) == LOW;
}

void InputManager::buzz(int durationMs) {
    if (mcpConnected) {
        mcp.digitalWrite(4, HIGH);
        delay(durationMs);
        mcp.digitalWrite(4, LOW);
    } else {
        digitalWrite(PIN_BUZZER, HIGH);
        delay(durationMs);
        digitalWrite(PIN_BUZZER, LOW);
    }
}