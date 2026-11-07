#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <ArduinoOTA.h>
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
InputManager inputs(I2C_SDA, I2C_SCL);
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

    // 1. Load Bus ID from memory
    preferences.begin("smartbus", false);
    BUS_ID = preferences.getString("busId", "");

    // 2. If no Bus ID is saved, start the Captive Portal
    if (BUS_ID == "") {
        Serial.println("[SETUP] No Bus ID found. Starting Captive Portal...");
        
        WiFiManager wifiManager;
        wifiManager.setConfigPortalTimeout(300); 
        wifiManager.startConfigPortal("SmartBus-Setup");

        WiFiServer server(80);
        server.begin();
        
        if (oledOk) {
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("SETUP MODE");
            display.println("Wi-Fi Connected.");
            display.println("Open Browser to:");
            display.println(WiFi.localIP());
            display.display();
        }

        Serial.println("========================================");
        Serial.println("Wi-Fi Connected!");
        Serial.print("Open this IP in your browser: ");
        Serial.println(WiFi.localIP());
        Serial.println("========================================");

        bool configured = false;
        while (!configured) {
            WiFiClient client = server.available();
            if (client) {
                String request = client.readStringUntil('\r');
                if (request.indexOf("/save") != -1) {
                    int idIndex = request.indexOf("busId=");
                    if (idIndex != -1) {
                        String rawId = request.substring(idIndex + 6, request.indexOf(" ", idIndex));
                        
                        rawId.trim();
                        rawId.toUpperCase(); 
                        rawId.replace("BUS-", "");
                        rawId.replace("BUS", "");
                        int busNum = rawId.toInt();
                        char formattedId[10];
                        sprintf(formattedId, "BUS-%02d", busNum);
                        String newId = String(formattedId);

                        preferences.putString("busId", newId);
                        BUS_ID = newId;
                        configured = true;
                        
                        client.println("HTTP/1.1 200 OK");
                        client.println("Content-Type: text/html");
                        client.println("Connection: close");
                        client.println();
                        client.println("<h1>Success! Bus ID set to " + newId + ". Rebooting...</h1>");
                        client.stop();
                        delay(2000);
                        ESP.restart();
                    }
                } else {
                    client.println("HTTP/1.1 200 OK");
                    client.println("Content-Type: text/html");
                    client.println("Connection: close");
                    client.println();
                    client.println("<html><body>");
                    client.println("<h2>SmartBus Setup</h2>");
                    client.println("<p>Enter the Bus Number (e.g. 1, 2, 15)</p>");
                    client.println("<form action='/save'>");
                    client.println("Bus ID: <input type='text' name='busId' placeholder='1' required><br><br>");
                    client.println("<input type='submit' value='Save & Reboot'>");
                    client.println("</form></body></html>");
                    client.stop();
                }
            }
            delay(10);
        }
    }

    Serial.println("[SETUP] Operating as: " + BUS_ID);

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
        display.println(BUS_ID + " ONLINE");
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

    gsm.begin(); 
    
    net.setBusId(BUS_ID);
    net.begin();
    
    // --- OTA Setup ---
    ArduinoOTA.setHostname(BUS_ID.c_str()); 
    ArduinoOTA.setPassword("uftbsmartbus"); 
    
    ArduinoOTA.onStart([]() {
        Serial.println("[OTA] Update Starting...");
    });
    ArduinoOTA.onEnd([]() {
        Serial.println("\n[OTA] Update Complete. Rebooting...");
    });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("[OTA] Error[%u]: ", error);
    });
    
    ArduinoOTA.begin();
    Serial.println("[OTA] Ready. Hostname: " + BUS_ID + ".local");
    // -----------------------

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
    ArduinoOTA.handle(); // Check for OTA updates

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
            display.clearDisplay();
            display.println(BUS_ID + " ONLINE");
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
            
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println(BUS_ID + " ONLINE");
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
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println(BUS_ID + " ONLINE");
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
    
    // 8. Heartbeat
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 10000) {
        lastHeartbeat = millis();
        Serial.printf("[Status] %s | WiFi: %s | OLED: %d\n", BUS_ID.c_str(), net.getStatus().c_str(), oledOk);
    }
    
    delay(50);
}