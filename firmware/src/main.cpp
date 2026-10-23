#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_MCP23X08.h>
#include <MFRC522.h>

// --- PIN DEFINITIONS ---
#define I2C_SDA 5
#define I2C_SCL 6
#define OLED_ADDR 0x3C
#define MCP_ADDR 0x20

// Temporary pin for RFID CS since MCP23008 GP5 is missing
#define RFID_CS_PIN 3 
#define RFID_RST_PIN -1 

// --- HARDWARE OBJECTS ---
Adafruit_SSD1306 display(128, 64, &Wire, -1);
Adafruit_MCP23X08 mcp;
MFRC522 rfid(RFID_CS_PIN, RFID_RST_PIN);

// --- STATUS FLAGS ---
bool oledOk = false;
bool mcpOk = false;
bool rfidOk = false;

// Helper function to scan I2C
bool checkI2CDevice(byte address) {
    Wire.beginTransmission(address);
    return (Wire.endTransmission() == 0);
}

void setup() {
    Serial.begin(115200);
    delay(1000); 
    
    Serial.println("\n========================================");
    Serial.println("UFTB SmartBus — Hardware Bring-up");
    Serial.println("========================================");

    // 1. Initialize I2C Bus
    Wire.begin(I2C_SDA, I2C_SCL);
    Serial.println("I2C Bus initialized (SDA:5, SCL:6)");

    // 2. Check for OLED
    if (checkI2CDevice(OLED_ADDR)) {
        oledOk = true;
        display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
        Serial.println("[OK] OLED Display found at 0x3C");
        
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 0);
        display.println("UFTB SmartBus");
        display.println("Booting...");
        display.display();
    } else {
        Serial.println("[ERROR] OLED Display NOT found at 0x3C.");
    }

    // 3. Check for MCP23008
    if (checkI2CDevice(MCP_ADDR)) {
        mcpOk = true;
        mcp.begin_I2C(MCP_ADDR);
        Serial.println("[OK] MCP23008 found at 0x20");
    } else {
        Serial.println("[WARNING] MCP23008 NOT found at 0x20. Button/Buzzer/RFID-CS features disabled.");
        Serial.println("          >>> SYSTEM CONTINUING IN DEGRADED MODE <<<");
    }

    // 4. Initialize MFRC522 (RFID)
    SPI.begin(7, 8, 9, RFID_CS_PIN);
    rfid.PCD_Init();
    
    byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    if (version != 0x00 && version != 0xFF) {
        rfidOk = true;
        Serial.print("[OK] MFRC522 RFID Reader found. Version: 0x");
        Serial.println(version, HEX);
    } else {
        Serial.println("[ERROR] MFRC522 RFID Reader NOT found.");
    }

    // 5. Update OLED with final status
    if (oledOk) {
        display.clearDisplay();
        display.setCursor(0, 0);
        display.println("UFTB SmartBus");
        display.println("Hardware Status:");
        display.print("OLED:  "); display.println(oledOk ? "OK" : "FAIL");
        display.print("MCP:   "); display.println(mcpOk ? "OK" : "MISSING");
        display.print("RFID:  "); display.println(rfidOk ? "OK" : "MISSING");
        display.display();
    }

    Serial.println("========================================\n");
}

void loop() {
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 5000) {
        lastHeartbeat = millis();
        Serial.printf("[Heartbeat] Uptime: %lu sec | OLED: %d | MCP: %d | RFID: %d\n", 
                      millis() / 1000, oledOk, mcpOk, rfidOk);
    }

    // If RFID is connected, poll for cards
    if (rfidOk) {
        if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
            Serial.print("[RFID] Card detected! UID: ");
            for (byte i = 0; i < rfid.uid.size; i++) {
                Serial.print(rfid.uid.uidByte[i] < 0x10 ? " 0" : " ");
                Serial.print(rfid.uid.uidByte[i], HEX);
            }
            Serial.println();
            rfid.PICC_HaltA(); 
        }
    }
}