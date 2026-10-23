#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "ResourceManager.h"
#include "RFIDManager.h"

// Pins
#define I2C_SDA 5
#define I2C_SCL 6
#define OLED_ADDR 0x3C
#define RFID_CS 3 
#define RFID_RST -1 

// Objects
Adafruit_SSD1306 display(128, 64, &Wire, -1);
ResourceManager resMgr;
RFIDManager rfid(RFID_CS, RFID_RST, resMgr);

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

    Wire.begin(I2C_SDA, I2C_SCL);
    
    // 1. Setup Resource Manager
    resMgr.begin();

    // 2. Check OLED
    if (checkI2CDevice(OLED_ADDR)) {
        oledOk = true;
        display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
        Serial.println("[OK] OLED Display found.");
    } else {
        Serial.println("[ERROR] OLED Display NOT found.");
    }

    // 3. Setup RFID using the Resource Manager
    SPI.begin(7, 8, 9, RFID_CS);
    if (rfid.begin()) {
        Serial.println("[OK] MFRC522 RFID found.");
    } else {
        Serial.println("[ERROR] MFRC522 RFID NOT found.");
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
        Serial.printf("[Heartbeat] OLED: %d | RFID: %d | SPI Owner: %s\n", 
                      oledOk, rfid.isConnected(), resMgr.getCurrentOwner());
    }
    
    delay(50);
}