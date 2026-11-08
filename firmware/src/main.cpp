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

// MQTT Request Variables
volatile bool hasNewMqttRequest = false;
String mqttRequestMessage = "";

// Camera Request Variables
volatile bool hasCameraRequest = false; 
String cameraRequestId = "";

// Audio Request Variables
volatile bool hasAudioRequest = false;
String audioRequestMessage = "";    

// Admin Call Request Variables
volatile bool hasAdminCallRequest = false;
String adminCallNumber = "";

// Emergency Button Variables
unsigned long emergencyHoldStart = 0;
bool emergencyHoldActive = false;
bool emergencyTriggered = false;

// --- Helper to center text ---
int getCenterX(String text, int textSize) {
    int charWidth = 6 * textSize;
    int textWidth = text.length() * charWidth;
    return (128 - textWidth) / 2;
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n========================================");
    Serial.println("UFTB SmartBus - FULL SYSTEM");
    Serial.println("========================================");

    // 1. INITIALIZE RESOURCE MANAGER
    resMgr.begin();

    // 2. INITIALIZE OLED
    if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        oledOk = true;
        Serial.println("[OK] OLED found at 0x3C");
    } else if (display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {
        oledOk = true;
        Serial.println("[OK] OLED found at 0x3D");
    } else {
        Serial.println("[ERROR] OLED NOT found at 0x3C or 0x3D");
    }

    if (oledOk) {
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 0);
        display.println("BOOTING...");
        display.display();
    }

    // 3. INIT INPUTS
    inputs.begin();

    // 4. CHECK FOR FACTORY RESET
    if (inputs.isSelectPressed()) {
        Serial.println("[FACTORY RESET] Wiping memory...");
        preferences.begin("smartbus", false);
        preferences.clear();
        preferences.end();
        delay(2000);
        ESP.restart();
    }

    // 5. LOAD BUS ID
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
                delay(3000);
                ESP.restart();
            } else {
                server.send(400, "text/plain", "Missing busId");
            }
        });

        server.begin();
        while (true) { server.handleClient(); delay(10); }
    } else {
        Serial.println("[WiFi] Connecting to saved network...");
        WiFi.begin(); 
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500); Serial.print(".");
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

    // --- UPDATE OLED HERE (SINGLE LINE BOX + IP) ---
    if (oledOk) {
        display.clearDisplay();
        
        // Draw the top box
        display.drawRect(0, 0, 128, 20, SSD1306_WHITE);
        
        // "BUS-01 ONLINE" Centered in the top box
        String topText = BUS_ID + " ONLINE";
        display.setTextSize(1);
        display.setCursor(getCenterX(topText, 1), 6); // Y=6 centers it vertically in a 20px box
        display.print(topText);
        
        // IP Address centered at the bottom
        String ipStr = "IP: " + WiFi.localIP().toString();
        display.setCursor(getCenterX(ipStr, 1), 50);
        display.print(ipStr);
        
        display.display();
    }
    // -------------------------------------------------

    Serial.println("[SETUP] Operating as: " + BUS_ID);

    // 6. INITIALIZE OTHER HARDWARE
    Wire.setClock(100000); 

    SPI.begin(7, 8, 9, SD_CS);
    delay(500);
    if (rfid.begin()) Serial.println("[OK] MFRC522 RFID found.");
    else Serial.println("[ERROR] MFRC522 RFID NOT found.");
    
    delay(500);
    if (sd.begin()) Serial.println("[OK] microSD Card found.");
    else Serial.println("[ERROR] microSD Card NOT found.");
    
    delay(500);
    if (camera.begin()) Serial.println("[OK] Camera initialized.");
    else Serial.println("[ERROR] Camera failed.");

    gsm.begin(); 
    
    net.setBusId(BUS_ID);
    net.begin();
    
    // --- OTA Setup ---
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

    // Callbacks
    net.setMessageCallback([](String payload) {
        Serial.println("[MQTT RECEIVED] " + payload);
        int start = payload.indexOf(":") + 2;
        int end = payload.indexOf("\"", start);
        mqttRequestMessage = payload.substring(start, end);
        hasNewMqttRequest = true;
    });

    net.setCameraCallback([](String payload) {
        int start = payload.indexOf(":") + 2;
        int end = payload.indexOf("\"", start);
        cameraRequestId = payload.substring(start, end);
        hasCameraRequest = true;
    });
    
    net.setAudioCallback([](String payload) {
        Serial.println("[MQTT AUDIO] " + payload);
        hasAudioRequest = true;
    });

    net.setAdminCallCallback([](String payload) {
        Serial.println("[MQTT ADMIN CALL] " + payload);
        int start = payload.indexOf(":") + 2;
        int end = payload.indexOf("\"", start);
        adminCallNumber = payload.substring(start, end);
        hasAdminCallRequest = true;
    });

    net.setContactsUpdateCallback([](String payload) {
        Serial.println("[MQTT CONTACTS] " + payload);
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
        
        inputs.buzz(100); delay(100);
        inputs.buzz(100); delay(100);
        inputs.buzz(100);
        
        if (oledOk) {
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("NEW AUDIO MSG");
            display.display();
            delay(3000);
            
            // Restore centered layout
            display.clearDisplay();
            display.drawRect(0, 0, 128, 20, SSD1306_WHITE);
            String topText = BUS_ID + " ONLINE";
            display.setTextSize(1);
            display.setCursor(getCenterX(topText, 1), 6);
            display.print(topText);
            String ipStr = "IP: " + WiFi.localIP().toString();
            display.setCursor(getCenterX(ipStr, 1), 50);
            display.print(ipStr);
            display.display();
        }
    }

    // 3. Student Stop Request
    if (hasNewMqttRequest) {
        hasNewMqttRequest = false;
        Serial.println("[ACTION] New Request: " + mqttRequestMessage);
        
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
            
            // Restore centered layout
            display.clearDisplay();
            display.drawRect(0, 0, 128, 20, SSD1306_WHITE);
            String topText = BUS_ID + " ONLINE";
            display.setTextSize(1);
            display.setCursor(getCenterX(topText, 1), 6);
            display.print(topText);
            String ipStr = "IP: " + WiFi.localIP().toString();
            display.setCursor(getCenterX(ipStr, 1), 50);
            display.print(ipStr);
            display.display();
        }
    }

    // 4. Admin Call Request
    if (hasAdminCallRequest) {
        hasAdminCallRequest = false;
        Serial.println("[GSM] Admin requested call. Waking SIM800L...");
        
        if (oledOk) {
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("ADMIN CALLING...");
            display.display();
        }
        
        gsm.makeAdminCall(adminCallNumber);
        
        if (oledOk) {
            // Restore centered layout
            display.clearDisplay();
            display.drawRect(0, 0, 128, 20, SSD1306_WHITE);
            String topText = BUS_ID + " ONLINE";
            display.setTextSize(1);
            display.setCursor(getCenterX(topText, 1), 6);
            display.print(topText);
            String ipStr = "IP: " + WiFi.localIP().toString();
            display.setCursor(getCenterX(ipStr, 1), 50);
            display.print(ipStr);
            display.display();
        }
    }
    
    net.loopMQTT();

    // 5. RFID Scan
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
    
    // 6. Emergency Button
    if (inputs.isEmergencyPressed()) {
        if (!emergencyHoldActive) {
            emergencyHoldActive = true;
            emergencyHoldStart = millis();
            Serial.println("[EMERGENCY] Button pressed. Hold for 3s to trigger...");
        } 
        else if (!emergencyTriggered && (millis() - emergencyHoldStart >= 3000)) {
            emergencyTriggered = true;
            Serial.println("[EMERGENCY] 3-second hold confirmed! TRIGGERING ALARM.");
            
            inputs.buzz(2000);
            
            if (oledOk) {
                display.clearDisplay();
                display.setCursor(0, 0);
                display.setTextSize(2);
                display.println("EMERGENCY!");
                display.display();
            }
            
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
        if (emergencyHoldActive && !emergencyTriggered) {
            Serial.println("[EMERGENCY] Cancelled (released before 3s).");
        }
        emergencyHoldActive = false;
        if (emergencyTriggered) {
            emergencyTriggered = false;
            delay(1000);
        }
    }
    
    // 7. GPS Updates
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
    
    // 8. Heartbeat (CENTERED)
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 10000) {
        lastHeartbeat = millis();
        Serial.printf("[Status] %s | WiFi: %s | OLED: %d\n", BUS_ID.c_str(), net.getStatus().c_str(), oledOk);
        
        if (oledOk) {
            display.clearDisplay();
            display.drawRect(0, 0, 128, 20, SSD1306_WHITE);
            String topText = BUS_ID + " ONLINE";
            display.setTextSize(1);
            display.setCursor(getCenterX(topText, 1), 6);
            display.print(topText);
            String ipStr = "IP: " + WiFi.localIP().toString();
            display.setCursor(getCenterX(ipStr, 1), 50);
            display.print(ipStr);
            display.display();
        }
    }
    
    delay(50);
}