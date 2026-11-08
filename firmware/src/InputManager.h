#pragma once
#include <Arduino.h>
#include "ResourceManager.h"

class InputManager {
public:
    InputManager(ResourceManager& rm);
    bool begin();
    
    bool isEmergencyPressed();
    bool isUpPressed();
    bool isDownPressed();
    bool isSelectPressed();
    void buzz(int durationMs);

private:
    ResourceManager& resMgr;
    bool mcpConnected;
};