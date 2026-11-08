#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <ArduinoOTA.h>
#include <WebServer.h>
#include "driver/i2s.h"
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

// --- AUDIO PIN DEFINITIONS (PDM Mic) ---
#define I2S_PDM_CLK 42
#define I2S_PDM_DATA 41
#define SAMPLE_RATE 16000
#define RECORD_SECONDS 30
#define TOTAL_SAMPLES (SAMPLE_RATE * RECORD_SECONDS)
#define BYTES_PER_SAMPLE 2

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
int currentBeepPhase = 0;

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

// --- AUDIO RECORDING STATE ---
enum AudioState { AUDIO_IDLE, AUDIO_RECORDING, AUDIO_UPLOADING };
AudioState audioState = AUDIO_IDLE;
int16_t* audioBuffer = nullptr;
size_t samplesCaptured = 0;
unsigned long audioStateStart = 0;
unsigned long lastOledProgressUpdate = 0;

// --- HELPER: CENTER TEXT ---
int getCenterX(String text, int textSize) {
    int charWidth = 6 * textSize;
    int textWidth = text.length() * charWidth;
    return (128 - textWidth) / 2;
}

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

void startBeeps(int count, int duration, int gap) {
    beepCount = 0;
    targetBeeps = count;
    beepDuration = duration;
    beepGap = gap;
    currentBeepPhase = 0;
    lastBeepTime = millis();
}

void updateBeeps() {
    if (beepCount >= targetBeeps) return;
    unsigned long now = millis();
    unsigned long elapsed = now - lastBeepTime;
    if (currentBeepPhase == 0) {
        if (elapsed >= beepGap) {
            inputs.buzz(beepDuration);
            currentBeepPhase = 1;
            lastBeepTime = now;
            beepCount++;
        }
    } else {
        if (elapsed >= beepGap) {
            currentBeepPhase = 0;
            lastBeepTime = now;
        }
    }
}

// --- NEW: I2S PDM INITIALIZATION (Classic API) ---
void initPDM() {
    Serial.println("[AUDIO] Initializing PDM microphone (driver/i2s.h)...");

    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 1024,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    esp_err_t err = i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] i2s_driver_install failed: %d\n", err);
        return;
    }

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_PIN_NO_CHANGE,
        .ws_io_num = I2S_PDM_CLK,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_PDM_DATA
    };

    err = i2s_set_pin(I2S_NUM_0, &pin_config);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] i2s_set_pin failed: %d\n", err);
        return;
    }

    Serial.println("[OK] PDM microphone initialized.");
}

// --- NEW: SEND AUDIO TO BACKEND ---
bool uploadAudioToBackend(uint8_t* data, size_t length) {
    if (WiFi.status() != WL_CONNECTED) return false;
    HTTPClient http;
    String url = String(BACKEND_URL) + "/api/trips/voice/upload?busId=" + BUS_ID + "&sampleRate=" + String(SAMPLE_RATE);
    http.begin(url);
    http.addHeader("Content-Type", "application/octet-stream");
    http.setTimeout(20000);
    int code = http.POST(data, length);
    http.end();
    Serial.printf("[AUDIO] Upload response: %d\n", code);
    return (code >= 200 && code < 300);
}

// --- NEW: NON-BLOCKING AUDIO RECORDING STATE MACHINE ---
void updateAudioRecording() {
    if (audioState == AUDIO_IDLE) return;

    unsigned long now = millis();
    unsigned long elapsed = now - audioStateStart;

    if (audioState == AUDIO_RECORDING) {
        size_t bytesRead = 0;
        size_t bytesToRead = (TOTAL_SAMPLES - samplesCaptured) * BYTES_PER_SAMPLE;
        if (bytesToRead > 2048) bytesToRead = 2048;

        esp_err_t result = i2s_read(I2S_NUM_0, (void*)((uint8_t*)audioBuffer + samplesCaptured * BYTES_PER_SAMPLE), bytesToRead, &bytesRead, portMAX_DELAY);

        if (result == ESP_OK && bytesRead > 0) {
            samplesCaptured += (bytesRead / BYTES_PER_SAMPLE);
        }

        // OLED progress update once per second
        if (oledOk && now - lastOledProgressUpdate > 1000) {
            lastOledProgressUpdate = now;
            int progress = (samplesCaptured * 100) / TOTAL_SAMPLES;
            display.clearDisplay();
            display.setCursor(0, 0);
            display.setTextSize(1);
            display.println("RECORDING...");
            display.print("Progress: ");
            display.print(progress);
            display.println("%");
            display.display();
        }

        if (samplesCaptured >= TOTAL_SAMPLES || elapsed > (RECORD_SECONDS * 1000 + 3000)) {
            audioState = AUDIO_UPLOADING;
            audioStateStart = millis();
            if (oledOk) {
                display.clearDisplay();
                display.setCursor(0, 0);
                display.println("UPLOADING...");
                display.display();
            }
        }
    } 
    else if (audioState == AUDIO_UPLOADING) {
        bool success = uploadAudioToBackend((uint8_t*)audioBuffer, TOTAL_SAMPLES * BYTES_PER_SAMPLE);
        if (success) {
            showTempMessage("AUDIO SENT!", "Success", 3000);
        } else {
            showTempMessage("UPLOAD FAILED", "Check WiFi", 3000);
        }
        audioState = AUDIO_IDLE;
        free(audioBuffer);
        audioBuffer = nullptr;
        samplesCaptured = 0;
    }
}

void startAudioRecording() {
    if (audioState != AUDIO_IDLE) return;
    size_t totalBytes = TOTAL_SAMPLES * BYTES_PER_SAMPLE;
    audioBuffer = (int16_t*)ps_malloc(totalBytes);
    if (audioBuffer == nullptr) {
        showTempMessage("NO PSRAM", "Cannot record", 3000);
        return;
    }
    samplesCaptured = 0;
    audioState = AUDIO_RECORDING;
    audioStateStart = millis();
    lastOledProgressUpdate = millis();
    Serial.println("[AUDIO] Recording started (20 seconds)...");
}

void setup() {
    Serial.begin(115200);
    delay(1000);
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

    if (inputs.isSelectPressed()) {
        Serial.println("[FACTORY RESET] Wiping memory...");
        preferences.begin("smartbus", false);
        preferences.clear();
        preferences.end();
        delay(2000);
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
                delay(3000);
                ESP.restart();
            } else {
                server.send(400, "text/plain", "Missing busId");
            }
        });

        server.begin();
        while (true) { 
            server.handleClient(); 
            delay(10);
        }
    } else {
        Serial.println("[WiFi] Connecting to saved network...");
        WiFi.begin(); 
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500); 
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
    delay(500);
    if (rfid.begin()) Serial.println("[OK] MFRC522 RFID found.");
    else Serial.println("[ERROR] MFRC522 RFID NOT found.");
    delay(500);
    if (sd.begin()) Serial.println("[OK] microSD Card found.");
    else Serial.println("[ERROR] microSD Card NOT found.");
    delay(500);
    if (camera.begin()) Serial.println("[OK] Camera initialized.");
    else Serial.println("[ERROR] Camera failed.");

    // --- INITIALIZE AUDIO ---
    initPDM();

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

    if (oledOk && oledAwake && !oledShowingTemp && audioState == AUDIO_IDLE) {
        if (millis() - lastOledActivity > OLED_TIMEOUT_MS) {
            sleepOled();
        }
    }
    
    if (oledOk && oledShowingTemp && millis() > oledRestoreTime) {
        drawMainScreen();
    }

    if (inputs.isUpPressed() || inputs.isDownPressed() || inputs.isSelectPressed()) {
        registerActivity();
    }

    updateBeeps();
    updateAudioRecording();

    if (hasCameraRequest) {
        hasCameraRequest = false;
        String base64Image = camera.captureBase64();
        if (base64Image != "" && net.isConnected()) {
            net.uploadPhoto(cameraRequestId, base64Image);
        }
    }

    if (hasAudioRequest) {
        hasAudioRequest = false;
        startBeeps(3, 100, 200);
        startAudioRecording();
    }

    if (hasNewMqttRequest) {
        hasNewMqttRequest = false;
        startBeeps(5, 1000, 1000);
        if (mqttRequestMessage.indexOf(" te achi") > 0) {
            showTempMessage("NEW REQUEST:", mqttRequestMessage, 5000);
        } else {
            showTempMessage("NEW REQUEST:", mqttRequestMessage, 5000);
        }
    }

    if (hasAdminCallRequest) {
        hasAdminCallRequest = false;
        showTempMessage("ADMIN CALLING...", "", 2000);
        gsm.makeAdminCall(adminCallNumber);
    }
    
    net.loopMQTT();

    if (rfid.isConnected() && rfid.scan()) {
        String uid = rfid.getLastUID();
        showTempMessage("BOARDING...", "UID: " + uid, 2000);
        if (net.isConnected()) {
            net.postAttendance(uid, "BOARDING", BUS_ID);
        }
    }
    
    if (inputs.isEmergencyPressed()) {
        if (!emergencyHoldActive) {
            emergencyHoldActive = true;
            emergencyHoldStart = millis();
        } 
        else if (!emergencyTriggered && (millis() - emergencyHoldStart >= 3000)) {
            emergencyTriggered = true;
            emergencyAlarmActive = true;
            emergencyAlarmStart = millis();
            
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

    if (emergencyAlarmActive) {
        if (millis() - emergencyAlarmStart < 2000) {
            inputs.buzz(100);
        } else {
            emergencyAlarmActive = false;
        }
    }
    
    static unsigned long lastGps = 0;
    if (millis() - lastGps > 5000 && audioState == AUDIO_IDLE) {
        lastGps = millis();
        gps.update();
        if (gps.hasFix() && net.isConnected()) {
            net.postGPS(BUS_ID, gps.getLat(), gps.getLng(), gps.getSpeed(), (gps.getSpeed() > 2.0) ? "Moving" : "Stopped");
        }
    }
    
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 10000) {
        lastHeartbeat = millis();
        Serial.printf("[Status] %s | WiFi: %s | OLED: %d\n", BUS_ID.c_str(), net.getStatus().c_str(), oledOk);
    }
    
    yield();
    vTaskDelay(1);
}