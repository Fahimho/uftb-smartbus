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

// --- PIN DEFINITIONS ---
#define I2C_SDA 5
#define I2C_SCL 6
#define SD_CS 21

// --- WIFI & BACKEND CONFIGURATION ---
// CHANGE THESE TO MATCH YOUR SETUP!
const char* WIFI_SSID = "Fahim Jisan";       
const char* WIFI_PASS = "fj@174712";   
const char* BACKEND_URL = "http://192.168.1.100:5000"; // YOUR PC IP
const String BUS_ID = "BUS-01";

// --- HARDWARE OBJECTS ---
Adafruit_SSD1306 display(128, 64, &Wire, -1);
ResourceManager resMgr;
RFIDManager rfid(UINT8_MAX, resMgr); // CS is on MCP, RST is 3.3V (UINT8_MAX)
SDManager sd(SD_CS, resMgr);
InputManager inputs(I2C_SDA, I2C_SCL);
NetworkManager net(WIFI_SSID, WIFI_PASS, BACKEND_URL);

bool oledOk = false;

bool checkI2CDevice(byte address) {
    Wire.beginTransmission(address);
    return (Wire.endTransmission() == 0);
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n========================================");
    Serial.println("UFTB SmartBus - LIVE SYSTEM");
    Serial.println("========================================");

    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(400000); 
    
    resMgr.begin();
    inputs.begin();

    // 1. OLED
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
        display.println("Waiting for card...");
        display.display();
        Serial.println("[OK] OLED Display found.");
    } else {
        Serial.println("[ERROR] OLED Display NOT found.");
    }

    // 2. SPI Bus Initialization
    // We tell the hardware SPI that the SD card (GPIO 21) is the primary native CS.
    // The MCP23008 will manually toggle the RFID CS via I2C inside the RFIDManager.
    SPI.begin(7, 8, 9, SD_CS); 
    
    if (rfid.begin()) Serial.println("[OK] MFRC522 RFID found.");
    else Serial.println("[ERROR] MFRC522 RFID NOT found.");

    // 3. SD Card
    if (sd.begin()) Serial.println("[OK] microSD Card found.");
    else Serial.println("[ERROR] microSD Card NOT found.");

    // 4. WiFi
    net.begin();
    
    Serial.println("========================================\n");
}

void loop() {
    // 1. RFID Scan to Database
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
            Serial.println("[CLOUD] Sent to backend.");
            
            if (oledOk) {
                display.println("SENT TO CLOUD!");
                display.display();
            }
        } else {
            Serial.println("[CLOUD] Offline. Storing locally.");
            // Fallback to SD card logic will go here later
        }
    }
    
    // 2. Emergency Button (Real System)
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
    
    // 3. Heartbeat
    static unsigned long last = 0;
    if (millis() - last > 10000) {
        last = millis();
        Serial.printf("[Status] WiFi: %s | OLED: %d\n", net.getStatus().c_str(), oledOk);
    }
    
    delay(50);
}