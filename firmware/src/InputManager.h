#pragma once
#include <Arduino.h>
#include <Adafruit_MCP23X08.h>

class InputManager {
public:
    InputManager(uint8_t sda, uint8_t scl);
    bool begin(); // Returns true if MCP is found, false if using native fallback
    
    bool isEmergencyPressed();
    bool isUpPressed();
    bool isDownPressed();
    bool isSelectPressed();
    void buzz(int durationMs);

private:
    Adafruit_MCP23X08 mcp;
    bool mcpConnected;
    
  // Native fallback pins (if MCP is missing)
    // Using OLED pins temporarily since OLED is unplugged for testing
    const uint8_t PIN_EMERGENCY = 5;  // D4
    const uint8_t PIN_UP = 6;         // D5
    const uint8_t PIN_DOWN = 4;       // D2
    const uint8_t PIN_SELECT = 43;    // D6
    const uint8_t PIN_BUZZER = 44;     // D7
};