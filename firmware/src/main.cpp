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

// --- PIN DEFINITIONS (From HARDWARE_PIN_VALIDATION.md) ---
#define I2C_SDA 5
#define I2C_SCL 6
#define SD_CS 21
#define GPS_RX 44  // XIAO D7 / GPIO44 acts as RX for the GPS TX wire

// --- WIFI & BACKEND CONFIGURATION ---
// CHANGE THESE TO MATCH YOUR SETUP!
const char* WIFI_SSID = "YOUR_WIFI_NAME";       
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";   
const char* BACKEND_URL = "http://192.168.1.100:5000"; // YOUR PC IP
const String BUS_ID = "BUS-01";

// --- HARDWARE OBJECTS ---
Adafruit_SSD1306 display(128, 64, &Wire, -1);
ResourceManager resMgr;
RFIDManager rfid(UINT8_MAX, resMgr); // RFID CS is on MCP23008 GP5
SDManager sd(SD_CS, resMgr);
InputManager inputs(I2C_SDA, I2C_SCL); // Uses MCP23008 GP0-GP3 if connected
NetworkManager net(WIFI_SSID, WIFI_PASS, BACKEND_URL);
GPSManager gps(GPS_RX, -1); // Pass -1 for TX because we only receive data from the GPS

bool oledOk = false;

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
    
    // 1. Resource Manager (Handles MCP23008 GP5 for RFID CS)
    resMgr.begin();

    // 2. Input Manager (Handles MCP23008 GP0-GP4 for buttons/buzzer)
    inputs.begin();

    // 3. OLED
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

    // 4. SPI for SD card (RFID CS is handled by MCP23008, so SD is the native SPI device)
    SPI.begin(7, 8, 9, SD_CS);
    
    // 5. RFID
    if (rfid.begin()) Serial.println("[OK] MFRC522 RFID found.");
    else Serial.println("[ERROR] MFRC522 RFID NOT found.");

    // 6. SD Card
    if (sd.begin()) Serial.println("[OK] microSD Card found.");
    else Serial.println("[ERROR] microSD Card NOT found.");

    // 7. WiFi
    net.begin();
    
    // 8. GPS (Uses GPIO44 / D7 for RX)
    gps.begin();
    
    Serial.println("========================================\n");
}

void loop() {
    // 1. RFID Scan
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
    
    // 2. Emergency Button
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
    
    // 3. GPS Update Logic (Every 5 seconds)
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
            // Print satellite status every 15 seconds if no fix
            if (millis() % 15000 < 5000) {
                Serial.printf("[GPS] Searching... Satellites: %d\n", gps.getSatellites());
            }
        }
    }
    
    // 4. Heartbeat
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 10000) {
        lastHeartbeat = millis();
        Serial.printf("[Status] WiFi: %s | OLED: %d\n", net.getStatus().c_str(), oledOk);
    }
    
    delay(50);
}