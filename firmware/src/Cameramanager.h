#pragma once
#include <Arduino.h>
#include "esp_camera.h"
#include "mbedtls/base64.h"

class CameraManager {
public:
    bool begin();
    String captureBase64();
private:
    bool initialized = false;
};