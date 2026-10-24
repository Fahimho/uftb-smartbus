#include "CameraManager.h"

// XIAO ESP32-S3 Sense Camera Pins
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     10
#define SIOD_GPIO_NUM     40
#define SIOC_GPIO_NUM     39
#define Y9_GPIO_NUM       48
#define Y8_GPIO_NUM       11
#define Y7_GPIO_NUM       12
#define Y6_GPIO_NUM       14
#define Y5_GPIO_NUM       16
#define Y4_GPIO_NUM       18
#define Y3_GPIO_NUM       17
#define Y2_GPIO_NUM       15
#define VSYNC_GPIO_NUM    38
#define HREF_GPIO_NUM     47
#define PCLK_GPIO_NUM     13

bool CameraManager::begin() {
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sscb_sda = SIOD_GPIO_NUM;
    config.pin_sscb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.frame_size = FRAMESIZE_VGA; // 640x480
    config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.jpeg_quality = 12;
    config.fb_count = 1;

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAMERA] Init failed with error 0x%x\n", err);
        return false;
    }
    initialized = true;
    return true;
}

String CameraManager::captureBase64() {
    if (!initialized) return "";
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[CAMERA] Capture failed");
        return "";
    }

    // Allocate memory for base64 encoding (size * 1.4 roughly)
    size_t out_len = 0;
    size_t max_len = fb->len * 2;
    unsigned char *out_buf = (unsigned char *)malloc(max_len);
    
    if (out_buf == NULL) {
        esp_camera_fb_return(fb);
        return "";
    }

    mbedtls_base64_encode(out_buf, max_len, &out_len, fb->buf, fb->len);
    
    // Create data URI prefix
    String base64String = "data:image/jpeg;base64,";
    base64String += String((char*)out_buf);
    
    free(out_buf);
    esp_camera_fb_return(fb);
    return base64String;
}