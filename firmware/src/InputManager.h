#pragma once
#include <Arduino.h>
#include "ResourceManager.h"

class InputManager {
public:
    InputManager(ResourceManager& rm);
    bool begin();

    bool isEmergencyPressed();
    bool isEmergencyHeld();       // raw state for emergency hold detection
    bool isUpPressed();
    bool isDownPressed();
    bool isSelectPressed();       // edge-triggered (one-shot true on press)
    bool isSelectHeld();          // NEW: raw state for SELECT hold detection
    void buzz(int durationMs);

private:
    ResourceManager& resMgr;
    bool mcpConnected;

    // Internal state for edge detection
    bool _lastUp = false;
    bool _lastDown = false;
    bool _lastSelect = false;
    bool _lastEmergency = false;
};