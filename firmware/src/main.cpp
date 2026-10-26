#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include "ResourceManager.h"
#include "RFIDManager.h"
#include "SDManager.h"
#include "InputManager.h"
#include "NetworkManager.h"
#include "GPSManager.h"
#include "CameraManager.h"

// --- PIN DEFINITIONS ---
#define I2C_SDA 5
#define I2C_SCL 6
#define SD_CS 21
#define GPS_RX 44

// --- WIFI & BACKEND CONFIGURATION ---
const char* WIFI_SSID = "Fahim Jisan";       
const char* WIFI_PASS = "fj@174712";  
const char* BACKEND_URL = "http://192.168.0.102:5000"; 
const char* MQTT_SERVER = "nf9aa1f2.ala.asia-southeast1.emqxsl.com"; 
const String BUS_ID = "BUS-01";

// --- HARDWARE OBJECTS ---
Adafruit_SSD1306 display(128, 64, &Wire, -1);
ResourceManager resMgr;
RFIDManager rfid(UINT8_MAX, resMgr);
SDManager sd(SD_CS, resMgr);
InputManager inputs(I2C_SDA, I2C_SCL);
NetworkManager net(WIFI_SSID, WIFI_PASS, BACKEND_URL, MQTT_SERVER);
GPSManager gps(GPS_RX, -1);
CameraManager camera;

bool oledOk = false;

// MQTT Request Variables
volatile bool hasNewMqttRequest = false;
String mqttRequestMessage = "";

// Camera Request Variables
volatile bool hasCameraRequest = false; 
String cameraRequestId = "";

// Audio Request Variables
volatile bool hasAudioRequest = false;
String audioRequestMessage = "";    

bool checkI2CDevice(byte address) {
    Wire.beginTransmission(address);
    return (Wire.endTransmission() == 0);
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n========================================");
    Serial.println("UFTB SmartBus - FULL SYSTEM");
    Serial.println("========================================");

    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(100000); 
    
    resMgr.begin();
    inputs.begin();

    uint8_t oledAddr = 0;
    if (checkI2CDevice(0x3C)) oledAddr = 0x3C;
    else if (checkI2CDevice(0x3D)) oledAddr = 0x3D;

    if (oledAddr != 0) {
        oledOk = true;
        display.begin(SSD1306_SWITCHCAPVCC, oledAddr);
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 0);
        display.println("BUS-01 ONLINE");
        display.display();
        Serial.println("[OK] OLED Display found.");
    }

    SPI.begin(7, 8, 9, SD_CS);
    
    if (rfid.begin()) Serial.println("[OK] MFRC522 RFID found.");
    else Serial.println("[ERROR] MFRC522 RFID NOT found.");

    if (sd.begin()) Serial.println("[OK] microSD Card found.");
    else Serial.println("[ERROR] microSD Card NOT found.");

    if (camera.begin()) Serial.println("[OK] Camera initialized.");
    else Serial.println("[ERROR] Camera failed.");

    net.begin();
    
    // 1. Student Request Callback
    net.setMessageCallback([](String payload) {
        Serial.println("[MQTT RECEIVED] " + payload);
        int start = payload.indexOf(":") + 2;
        int end = payload.indexOf("\"", start);
        mqttRequestMessage = payload.substring(start, end);
        hasNewMqttRequest = true;
    });

    // 2. Camera Request Callback
    net.setCameraCallback([](String payload) {
        int start = payload.indexOf(":") + 2;
        int end = payload.indexOf("\"", start);
        cameraRequestId = payload.substring(start, end);
        hasCameraRequest = true;
    });
    
    // 3. Audio Request Callback
    net.setAudioCallback([](String payload) {
        Serial.println("[MQTT AUDIO] " + payload);
        hasAudioRequest = true;
    });

    gps.begin();
    
    Serial.println("========================================\n");
}

void loop() {
    // 1. Camera Request
    if (hasCameraRequest) {
        hasCameraRequest = false;
        Serial.println("[CAMERA] Capture requested! ID: " + cameraRequestId);
        
        String base64Image = camera.captureBase64();
        
        if (base64Image != "") {
            if (net.isConnected()) {
                bool success = net.uploadPhoto(cameraRequestId, base64Image);
                if (success) Serial.println("[CAMERA] Real photo uploaded to backend.");
                else Serial.println("[CAMERA] Upload failed.");
            }
        } else {
            Serial.println("[CAMERA] Failed to capture image.");
        }
    }

    // 2. Audio Request
    if (hasAudioRequest) {
        hasAudioRequest = false;
        Serial.println("[AUDIO] New voice message received!");
        
        // 3 beeps for audio
        inputs.buzz(100); delay(100);
        inputs.buzz(100); delay(100);
        inputs.buzz(100);
        
        if (oledOk) {
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("NEW AUDIO MSG");
            display.display();
            delay(3000);
            display.clearDisplay();
            display.println("BUS-01 ONLINE");
            display.display();
        }
    }

    // 3. Student Stop Request
    if (hasNewMqttRequest) {
        hasNewMqttRequest = false;
        Serial.println("[ACTION] New Request: " + mqttRequestMessage);
        
        // 5 Beeps: 1s ON, 1s OFF
        for (int i = 0; i < 5; i++) {
            inputs.buzz(1000);
            delay(1000);
        }
        
        if (oledOk) {
            display.clearDisplay();
            display.setTextSize(1);
            display.setCursor(0, 0);
            
            int teIndex = mqttRequestMessage.indexOf(" te achi");
            if (teIndex > 0) {
                String line1 = mqttRequestMessage.substring(0, teIndex);
                String line2 = mqttRequestMessage.substring(teIndex + 1);
                display.println("NEW REQUEST:");
                display.println(line1);
                display.println(line2);
            } else {
                display.println("NEW REQUEST:");
                display.println(mqttRequestMessage);
            }
            
            display.display();
            delay(5000);
            
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("BUS-01 ONLINE");
            display.display();
        }
    }
    
    net.loopMQTT();

    // 4. RFID Scan
    if (rfid.isConnected() && rfid.scan()) {
        String uid = rfid.getLastUID();
        Serial.println("[SCAN] Card: " + uid);
        
        if (oledOk) {
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("BOARDING...");
            display.println("UID: " + uid);
            display.display();
        }

        if (net.isConnected()) {
            net.postAttendance(uid, "BOARDING", BUS_ID);
            Serial.println("[CLOUD] Attendance sent.");
        }
    }
    
    // 5. Emergency Button
    if (inputs.isEmergencyPressed()) {
        Serial.println("[EMERGENCY] Button pressed!");
        inputs.buzz(1000); 
        
        if (oledOk) {
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("EMERGENCY!");
            display.display();
        }
        delay(1000); 
    }
    
    // 6. GPS Updates
    static unsigned long lastGps = 0;
    if (millis() - lastGps > 5000) {
        lastGps = millis();
        gps.update();
        
        if (gps.hasFix()) {
            double lat = gps.getLat();
            double lng = gps.getLng();
            double speed = gps.getSpeed();
            String status = (speed > 2.0) ? "Moving" : "Stopped";
            
            Serial.printf("[GPS] Lat: %.6f, Lng: %.6f, Speed: %.1f\n", lat, lng, speed);
            
            if (net.isConnected()) {
                net.postGPS(BUS_ID, lat, lng, speed, status);
            }
        } else {
            if (millis() % 15000 < 5000) {
                Serial.printf("[GPS] Searching... Satellites: %d\n", gps.getSatellites());
            }
        }
    }
    
    // 7. Heartbeat
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 10000) {
        lastHeartbeat = millis();
        Serial.printf("[Status] WiFi: %s | OLED: %d\n", net.getStatus().c_str(), oledOk);
    }
    
    delay(50);
}