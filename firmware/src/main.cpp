#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include "ResourceManager.h"
#include "RFIDManager.h"
#include "SDManager.h"

// --- PIN DEFINITIONS ---
#define I2C_SDA 5
#define I2C_SCL 6
#define RFID_CS 3 
#define RFID_RST -1 
#define SD_CS 21

// --- HARDWARE OBJECTS ---
Adafruit_SSD1306 display(128, 64, &Wire, -1);
ResourceManager resMgr;
RFIDManager rfid(RFID_CS, RFID_RST, resMgr);
SDManager sd(SD_CS, resMgr);

bool oledOk = false;

bool checkI2CDevice(byte address) {
    Wire.beginTransmission(address);
    return (Wire.endTransmission() == 0);
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n========================================");
    Serial.println("UFTB SmartBus - Advanced Drivers");
    Serial.println("========================================");

    // 1. Initialize I2C Bus at 100kHz for stability
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(100000); 
    
    // 2. Setup Resource Manager
    resMgr.begin();

    // 3. Check OLED (Try 0x3C, then 0x3D)
    uint8_t oledAddr = 0;
    if (checkI2CDevice(0x3C)) {
        oledAddr = 0x3C;
    } else if (checkI2CDevice(0x3D)) {
        oledAddr = 0x3D;
    }

    if (oledAddr != 0) {
        oledOk = true;
        if(!display.begin(SSD1306_SWITCHCAPVCC, oledAddr)) {
            Serial.println("[ERROR] SSD1306 allocation failed");
            oledOk = false;
        } else {
            Serial.printf("[OK] OLED Display found at 0x%02X\n", oledAddr);
            display.clearDisplay();
            display.setTextColor(SSD1306_WHITE);
            display.setTextSize(1);
            display.setCursor(0, 0);
            display.println("UFTB SmartBus");
            display.println("Booting...");
            display.display();
        }
    } else {
        Serial.println("[ERROR] OLED Display NOT found.");
    }

    // 4. Initialize MFRC522 (RFID)
    SPI.begin(7, 8, 9, RFID_CS);
    if (rfid.begin()) {
        Serial.println("[OK] MFRC522 RFID found.");
    } else {
        Serial.println("[ERROR] MFRC522 RFID NOT found.");
    }

    // 5. Initialize microSD
    if (sd.begin()) {
        Serial.println("[OK] microSD Card found.");
    } else {
        Serial.println("[ERROR] microSD Card NOT found.");
    }

    Serial.println("========================================\n");
}

void loop() {
    // Try to scan an RFID card
    rfid.scan();
    
    // Print heartbeat every 5 seconds
    static unsigned long last = 0;
    if (millis() - last > 5000) {
        last = millis();
        Serial.printf("[Heartbeat] OLED: %d | RFID: %d | SD: %d | SPI Owner: %s\n", 
                      oledOk, rfid.isConnected(), sd.isConnected(), resMgr.getCurrentOwner());
                      
        // Write a log to the SD card
        if (sd.isConnected()) {
            String logMsg = "Uptime: " + String(millis() / 1000) + "s | OLED: " + String(oledOk);
            sd.writeLog(logMsg);
        }
    }
    
    delay(50);
}