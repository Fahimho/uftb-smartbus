#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <ArduinoOTA.h>
#include <WebServer.h>
#include "ResourceManager.h"
#include "RFIDManager.h"
#include "SDManager.h"
#include "InputManager.h"
#include "NetworkManager.h"
#include "GPSManager.h"
#include "CameraManager.h"
#include "Sim800Manager.h"

// --- PIN DEFINITIONS ---
#define I2C_SDA 5
#define I2C_SCL 6
#define SD_CS 21
#define GPS_RX 44
#define GSM_RX 1
#define GSM_TX 2

// --- WIFI & BACKEND CONFIGURATION ---
const char* BACKEND_URL = "http://192.168.0.102:5000"; 
const char* MQTT_SERVER = "nf9aa1f2.ala.asia-southeast1.emqxsl.com"; 

// --- DYNAMIC BUS ID ---
String BUS_ID = "UNASSIGNED";
Preferences preferences;

// --- HARDWARE OBJECTS ---
Adafruit_SSD1306 display(128, 64, &Wire, -1);
ResourceManager resMgr;
RFIDManager rfid(UINT8_MAX, resMgr);
SDManager sd(SD_CS, resMgr);
InputManager inputs(resMgr);
NetworkManager net("", "", BACKEND_URL, MQTT_SERVER); 
GPSManager gps(GPS_RX, -1);
CameraManager camera;
Sim800Manager gsm(GSM_RX, GSM_TX);

bool oledOk = false;

// --- NON-BLOCKING OLED STATE ---
unsigned long lastOledActivity = 0;
const unsigned long OLED_TIMEOUT_MS = 20000;
bool oledAwake = true;
unsigned long oledRestoreTime = 0;
bool oledShowingTemp = false;

// --- NON-BLOCKING BEEP STATE ---
int beepCount = 0;
int targetBeeps = 0;
unsigned long lastBeepTime = 0;
int beepDuration = 0;
int beepGap = 0;
int currentBeepPhase = 0; // 0 = idle, 1 = beeping

// --- MQTT/EVENT STATE ---
volatile bool hasNewMqttRequest = false;
String mqttRequestMessage = "";
volatile bool hasCameraRequest = false; 
String cameraRequestId = "";
volatile bool hasAudioRequest = false;
volatile bool hasAdminCallRequest = false;
String adminCallNumber = "";

// --- EMERGENCY STATE ---
unsigned long emergencyHoldStart = 0;
bool emergencyHoldActive = false;
bool emergencyTriggered = false;
bool emergencyAlarmActive = false;
unsigned long emergencyAlarmStart = 0;

// --- HELPER: CENTER TEXT ---
int getCenterX(String text, int textSize) {
    int charWidth = 6 * textSize;
    int textWidth = text.length() * charWidth;
    return (128 - textWidth) / 2;
}

// --- HELPER: DRAW MAIN SCREEN ---
void drawMainScreen() {
    if (!oledOk) return;
    display.clearDisplay();
    display.drawRect(0, 0, 128, 20, SSD1306_WHITE);
    String topText = BUS_ID + " ONLINE";
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(getCenterX(topText, 1), 6);
    display.print(topText);
    String ipStr = "IP: " + WiFi.localIP().toString();
    display.setCursor(getCenterX(ipStr, 1), 50);
    display.print(ipStr);
    display.display();
    lastOledActivity = millis();
    oledShowingTemp = false;
}

// --- HELPER: SHOW TEMP MESSAGE ---
void showTempMessage(String line1, String line2, int durationMs) {
    if (!oledOk) return;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println(line1);
    if (line2 != "") display.println(line2);
    display.display();
    oledRestoreTime = millis() + durationMs;
    oledShowingTemp = true;
    lastOledActivity = millis();
}

// --- HELPER: WAKE / SLEEP ---
void wakeOled() {
    if (!oledOk) return;
    display.ssd1306_command(SSD1306_DISPLAYON);
    oledAwake = true;
    lastOledActivity = millis();
    drawMainScreen();
}

void sleepOled() {
    if (!oledOk) return;
    display.ssd1306_command(SSD1306_DISPLAYOFF);
    oledAwake = false;
}

void registerActivity() {
    lastOledActivity = millis();
    if (!oledAwake) wakeOled();
}

// --- HELPER: NON-BLOCKING BEEPS (STATE MACHINE) ---
void startBeeps(int count, int duration, int gap) {
    beepCount = 0;
    targetBeeps = count;
    beepDuration = duration;
    beepGap = gap;
    currentBeepPhase = 0; // Start with OFF phase
    lastBeepTime = millis();
}

void updateBeeps() {
    if (beepCount >= targetBeeps) return;
    
    unsigned long now = millis();
    unsigned long elapsed = now - lastBeepTime;

    if (currentBeepPhase == 0) {
        // OFF phase (gap)
        if (elapsed >= beepGap) {
            // Turn ON
            inputs.buzz(beepDuration);
            currentBeepPhase = 1;
            lastBeepTime = now;
            beepCount++;
        }
    } else {
        // ON phase (already beeped, wait for gap)
        if (elapsed >= beepGap) {
            currentBeepPhase = 0;
            lastBeepTime = now;
        }
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000); // Safe: boot only
    Serial.println("\n========================================");
    Serial.println("UFTB SmartBus - FULL SYSTEM");
    Serial.println("========================================");

    resMgr.begin();

    if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        oledOk = true;
        Serial.println("[OK] OLED found at 0x3C");
    } else if (display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {
        oledOk = true;
        Serial.println("[OK] OLED found at 0x3D");
    } else {
        Serial.println("[ERROR] OLED NOT found");
    }

    if (oledOk) {
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 0);
        display.println("BOOTING...");
        display.display();
    }

    inputs.begin();

    // Factory Reset
    if (inputs.isSelectPressed()) {
        Serial.println("[FACTORY RESET] Wiping memory...");
        preferences.begin("smartbus", false);
        preferences.clear();
        preferences.end();
        delay(2000); // Safe: about to reboot
        ESP.restart();
    }

    preferences.begin("smartbus", false);
    BUS_ID = preferences.getString("busId", "");
    preferences.end();

    if (BUS_ID == "") {
        Serial.println("[SETUP] No Bus ID found. Starting Captive Portal...");
        WiFiManager wifiManager;
        wifiManager.setConfigPortalTimeout(300); 
        wifiManager.startConfigPortal("SmartBus-Setup");

        WebServer server(80);
        if (oledOk) {
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("SETUP MODE");
            display.println("Open Browser to:");
            display.println(WiFi.localIP());
            display.display();
        }

        server.on("/", HTTP_GET, [&]() {
            String html = "<html><body><h2>SmartBus Setup</h2>";
            html += "<form action='/save' method='GET'>";
            html += "Bus ID: <input type='text' name='busId' required><br><br>";
            html += "<input type='submit' value='Save & Reboot'></form></body></html>";
            server.send(200, "text/html", html);
        });

        server.on("/save", HTTP_GET, [&]() {
            if (server.hasArg("busId")) {
                String rawId = server.arg("busId");
                rawId.trim(); rawId.toUpperCase(); 
                rawId.replace("BUS-", ""); rawId.replace("BUS", "");
                char formattedId[10];
                sprintf(formattedId, "BUS-%02d", rawId.toInt());
                String newId = String(formattedId);
                preferences.putString("busId", newId);
                BUS_ID = newId;
                server.send(200, "text/html", "<h1 style='color:green;'>Success! Rebooting...</h1>");
                delay(3000); // Safe: about to reboot
                ESP.restart();
            } else {
                server.send(400, "text/plain", "Missing busId");
            }
        });

        server.begin();
        while (true) { 
            server.handleClient(); 
            delay(10); // Safe: cooperative yield in portal mode
        }
    } else {
        Serial.println("[WiFi] Connecting to saved network...");
        WiFi.begin(); 
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500); // Safe: boot only
            Serial.print(".");
            attempts++;
        }
        Serial.println();
        if (WiFi.status() == WL_CONNECTED) {
            Serial.print("[WiFi] Connected! IP: ");
            Serial.println(WiFi.localIP());
        } else {
            Serial.println("[WiFi] Connection failed.");
        }
    }

    drawMainScreen();

    Serial.println("[SETUP] Operating as: " + BUS_ID);

    Wire.setClock(100000); 
    SPI.begin(7, 8, 9, SD_CS);
    delay(500); // Safe: boot only
    if (rfid.begin()) Serial.println("[OK] MFRC522 RFID found.");
    else Serial.println("[ERROR] MFRC522 RFID NOT found.");
    delay(500); // Safe: boot only
    if (sd.begin()) Serial.println("[OK] microSD Card found.");
    else Serial.println("[ERROR] microSD Card NOT found.");
    delay(500); // Safe: boot only
    if (camera.begin()) Serial.println("[OK] Camera initialized.");
    else Serial.println("[ERROR] Camera failed.");

    gsm.begin(); 
    net.setBusId(BUS_ID);
    net.begin();
    
    ArduinoOTA.setHostname(BUS_ID.c_str()); 
    ArduinoOTA.setPassword("uftbsmartbus"); 
    ArduinoOTA.onStart([]() { Serial.println("[OTA] Update Starting..."); });
    ArduinoOTA.onEnd([]() { Serial.println("\n[OTA] Update Complete. Rebooting..."); });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("[OTA] Error[%u]: ", error);
    });
    ArduinoOTA.begin();
    Serial.println("[OTA] Ready. Hostname: " + BUS_ID + ".local");

    net.setMessageCallback([](String payload) {
        int start = payload.indexOf(":") + 2;
        int end = payload.indexOf("\"", start);
        mqttRequestMessage = payload.substring(start, end);
        hasNewMqttRequest = true;
        registerActivity();
    });

    net.setCameraCallback([](String payload) {
        int start = payload.indexOf(":") + 2;
        int end = payload.indexOf("\"", start);
        cameraRequestId = payload.substring(start, end);
        hasCameraRequest = true;
    });
    
    net.setAudioCallback([](String payload) {
        hasAudioRequest = true;
        registerActivity();
    });

    net.setAdminCallCallback([](String payload) {
        int start = payload.indexOf(":") + 2;
        int end = payload.indexOf("\"", start);
        adminCallNumber = payload.substring(start, end);
        hasAdminCallRequest = true;
        registerActivity();
    });

    net.setContactsUpdateCallback([](String payload) {
        int start = payload.indexOf("[") + 1;
        int end = payload.indexOf("]");
        String list = payload.substring(start, end);
        
        String nums[5];
        int count = 0;
        int quoteStart = 0;
        while (count < 5) {
            quoteStart = list.indexOf("\"", quoteStart);
            if (quoteStart < 0) break;
            int quoteEnd = list.indexOf("\"", quoteStart + 1);
            if (quoteEnd < 0) break;
            nums[count] = list.substring(quoteStart + 1, quoteEnd);
            count++;
            quoteStart = quoteEnd + 1;
        }
        gsm.updateContacts(nums, count);
    });

    gps.begin();
    Serial.println("========================================\n");
}

void loop() {
    ArduinoOTA.handle(); 

    // --- OLED SLEEP / WAKE ---
    if (oledOk && oledAwake && !oledShowingTemp) {
        if (millis() - lastOledActivity > OLED_TIMEOUT_MS) {
            sleepOled();
        }
    }
    
    // Restore main screen if temp message expired
    if (oledOk && oledShowingTemp && millis() > oledRestoreTime) {
        drawMainScreen();
    }

    // --- WAKE ON BUTTON PRESS ---
    if (inputs.isUpPressed() || inputs.isDownPressed() || inputs.isSelectPressed()) {
        registerActivity();
    }

    // --- NON-BLOCKING BEEP UPDATE ---
    updateBeeps();

    // --- CAMERA REQUEST ---
    if (hasCameraRequest) {
        hasCameraRequest = false;
        String base64Image = camera.captureBase64();
        if (base64Image != "" && net.isConnected()) {
            net.uploadPhoto(cameraRequestId, base64Image);
        }
    }

    // --- AUDIO REQUEST ---
    if (hasAudioRequest) {
        hasAudioRequest = false;
        startBeeps(3, 100, 200); // 3 short beeps
        showTempMessage("NEW AUDIO MSG", "", 3000);
    }

    // --- STUDENT STOP REQUEST ---
    if (hasNewMqttRequest) {
        hasNewMqttRequest = false;
        startBeeps(5, 1000, 1000); // 5 long beeps
        
        if (mqttRequestMessage.indexOf(" te achi") > 0) {
            showTempMessage("NEW REQUEST:", mqttRequestMessage, 5000);
        } else {
            showTempMessage("NEW REQUEST:", mqttRequestMessage, 5000);
        }
    }

    // --- ADMIN CALL REQUEST ---
    if (hasAdminCallRequest) {
        hasAdminCallRequest = false;
        showTempMessage("ADMIN CALLING...", "", 2000);
        gsm.makeAdminCall(adminCallNumber);
    }
    
    net.loopMQTT();

    // --- RFID SCAN ---
    if (rfid.isConnected() && rfid.scan()) {
        String uid = rfid.getLastUID();
        showTempMessage("BOARDING...", "UID: " + uid, 2000);
        if (net.isConnected()) {
            net.postAttendance(uid, "BOARDING", BUS_ID);
        }
    }
    
    // --- EMERGENCY BUTTON ---
    if (inputs.isEmergencyPressed()) {
        if (!emergencyHoldActive) {
            emergencyHoldActive = true;
            emergencyHoldStart = millis();
        } 
        else if (!emergencyTriggered && (millis() - emergencyHoldStart >= 3000)) {
            emergencyTriggered = true;
            emergencyAlarmActive = true;
            emergencyAlarmStart = millis();
            
            // Show emergency screen
            if (oledOk) {
                registerActivity();
                display.clearDisplay();
                display.setTextSize(2);
                display.setCursor(0, 0);
                display.println("EMERGENCY!");
                display.display();
                oledShowingTemp = true;
                oledRestoreTime = millis() + 5000;
            }
            
            // Trigger everything
            gps.update();
            String latStr = gps.hasFix() ? String(gps.getLat(), 6) : "0.0";
            String lngStr = gps.hasFix() ? String(gps.getLng(), 6) : "0.0";
            String eventId = "";
            if (net.isConnected()) {
                eventId = net.postEmergency(BUS_ID, latStr.toDouble(), lngStr.toDouble());
            }
            gsm.triggerEmergency(BUS_ID, latStr, lngStr);
            if (eventId != "") {
                net.postAlertStatus(eventId, "delivered");
            }
        }
    } 
    else {
        emergencyHoldActive = false;
        emergencyTriggered = false;
    }

    // Emergency alarm beep (non-blocking)
    if (emergencyAlarmActive) {
        if (millis() - emergencyAlarmStart < 2000) {
            inputs.buzz(100); // Short beeps, called repeatedly
        } else {
            emergencyAlarmActive = false;
        }
    }
    
    // --- GPS UPDATES ---
    static unsigned long lastGps = 0;
    if (millis() - lastGps > 5000) {
        lastGps = millis();
        gps.update();
        if (gps.hasFix() && net.isConnected()) {
            net.postGPS(BUS_ID, gps.getLat(), gps.getLng(), gps.getSpeed(), (gps.getSpeed() > 2.0) ? "Moving" : "Stopped");
        }
    }
    
    // --- HEARTBEAT ---
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 10000) {
        lastHeartbeat = millis();
        Serial.printf("[Status] %s | WiFi: %s | OLED: %d\n", BUS_ID.c_str(), net.getStatus().c_str(), oledOk);
    }
    
    // --- NON-BLOCKING YIELD ---
    yield();
    vTaskDelay(1);
}