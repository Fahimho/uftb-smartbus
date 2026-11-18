#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <ArduinoOTA.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include "driver/i2s.h"
#include "ResourceManager.h"
#include "RFIDManager.h"
#include "SDManager.h"
#include "InputManager.h"
#include "NetworkManager.h"
#include "GPSManager.h"
#include "CameraManager.h"
#include "Sim800Manager.h"
#include "Diag.h"
#include "Buzzer.h"
#include "UiPolicy.h"
#include "esp_system.h"

// --- PIN DEFINITIONS ---
#define I2C_SDA 5
#define I2C_SCL 6
#define SD_CS 21
#define GPS_RX 44
#define GSM_RX 1
#define GSM_TX 2

// --- AUDIO PIN DEFINITIONS ---
#define I2S_PDM_CLK 42
#define I2S_PDM_DATA 41
#define SAMPLE_RATE 16000
#define BYTES_PER_SAMPLE 2

// --- CONFIGURATION ---
const char* BACKEND_URL = "http://192.168.0.102:5000";
const char* MQTT_SERVER = "nf9aa1f2.ala.asia-southeast1.emqxsl.com";
String BUS_ID = "UNASSIGNED";
Preferences preferences;

// --- HARDWARE ---
Adafruit_SSD1306 display(128, 64, &Wire, -1);
ResourceManager resMgr;
RFIDManager rfid(UINT8_MAX, resMgr);
SDManager sd(SD_CS, resMgr);
InputManager inputs(resMgr);
Buzzer buzzer(resMgr);
NetworkManager net("", "", BACKEND_URL, MQTT_SERVER);
GPSManager gps(GPS_RX, -1);
CameraManager camera;
Sim800Manager gsm(GSM_RX, GSM_TX);

bool oledOk = false;
unsigned long lastOledActivity = 0;
const unsigned long OLED_TIMEOUT_MS = 20000;
volatile bool oledAwake = true;   // written by the UI (loop task), read by the input task
unsigned long oledRestoreTime = 0;
bool oledShowingTemp = false;
// true while the startup/"home" screen (bus id + IP) is on the display. The first navigation press
// only dismisses it to the main menu; it must never navigate or select.
bool homeVisible = false;

// ---- OLED access goes through the shared I2C mutex ----------------------------------
// The OLED and the MCP23017 (buttons, buzzer, RFID chip-select) share Wire. Drawing into the
// frame buffer needs no lock; only the bus transfers do. Bounded wait: if the bus is busy for
// 250 ms the push is skipped (the next draw refreshes the screen).
static uint32_t oledPushSkipped = 0;
static void oledPush() {
    if (!oledOk) return;
    if (!resMgr.lockI2C(250)) { oledPushSkipped++; return; }
    display.display();
    homeVisible = false;     // any screen update clears it; drawMainScreen() sets it again afterwards
    resMgr.unlockI2C();
}
static void oledCmd(uint8_t c) {
    if (!oledOk) return;
    if (!resMgr.lockI2C(250)) { oledPushSkipped++; return; }
    display.ssd1306_command(c);
    resMgr.unlockI2C();
}

// Beeps and the emergency alarm are owned by Buzzer (Buzzer.h): single owner of MCP GPA4.

// --- MQTT / EVENT STATE ---
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

// --- AUDIO STATE ---
enum AudioState { AUDIO_IDLE, AUDIO_RECORDING, AUDIO_UPLOADING };
AudioState audioState = AUDIO_IDLE;
int16_t* audioBuffer = nullptr;
size_t samplesCaptured = 0;
unsigned long audioStateStart = 0;
unsigned long lastOledProgressUpdate = 0;
int RECORD_SECONDS = 30;

// --- MENU STATE ---
enum MenuScreen {
  SCREEN_MAIN, SCREEN_VOICE, SCREEN_TRIPS, SCREEN_PASSENGERS,
  SCREEN_SETTINGS, SCREEN_ADJUST_BRIGHTNESS, SCREEN_ADJUST_REC_DUR,
  SCREEN_CONFIRM_CLEAR, SCREEN_BUS_INFO
};
MenuScreen currentScreen = SCREEN_MAIN;
int menuCursor = 0;
int menuScroll = 0;
int brightnessValue = 128;
int pendingBrightness = 128;
int pendingRecDur = 30;
String recentNames[10];
int recentNamesCount = 0;
bool tripActive = false;

// --- FREERTOS QUEUE ---
// ButtonEvent (UP/DOWN/SELECT/SELECT_LONG/WAKE/EMERGENCY) is defined in InputManager.h.
QueueHandle_t buttonQueue = NULL;

// --- HELPER ---
int getCenterX(String text, int textSize) {
    int charWidth = 6 * textSize;
    return (128 - (text.length() * charWidth)) / 2;
}

// --- FORWARD DECLARATIONS ---
void drawMainScreen();
void drawMenu(String title, String items[], int count);
void showTempMessage(String line1, String line2, int durationMs);
void wakeOled();
void sleepOled();
void registerActivity();
void startBeeps(int count, int duration, int gap);
void initPDM();
bool uploadAudioToBackend(uint8_t* data, size_t length);
void startAudioRecording();
void updateAudioRecording();
void drawCurrentScreen();
void processButtonEvent(ButtonEvent ev);
void handleEmergency();
void apiStartTrip();
void apiEndTrip();
void saveBrightness(int val);
void saveRecDur(int val);
void clearAllData();

// Button polling/debouncing lives in InputManager (InputTask, Core 0).

// --- OLED DRAWING ---
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
    oledPush();
    homeVisible = true;
    lastOledActivity = millis();
    oledShowingTemp = false;
}

void drawMenu(String title, String items[], int count) {
    if (!oledOk) return;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(2, 0);
    display.print(title);

    const int VISIBLE = 6;
    if (menuCursor < menuScroll) menuScroll = menuCursor;
    if (menuCursor >= menuScroll + VISIBLE) menuScroll = menuCursor - VISIBLE + 1;

    for (int i = 0; i < VISIBLE; i++) {
        int idx = menuScroll + i;
        if (idx >= count) break;
        int y = 16 + (i * 8);

        if (idx == menuCursor) {
            display.fillRect(0, y, 128, 8, SSD1306_WHITE);
            display.setTextColor(SSD1306_BLACK);
        } else {
            display.setTextColor(SSD1306_WHITE);
        }
        display.setCursor(2, y);
        display.print(items[idx]);
    }
    oledPush();
}

void showTempMessage(String line1, String line2, int durationMs) {
    if (!oledOk) return;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println(line1);
    if (line2 != "") display.println(line2);
    oledPush();
    oledRestoreTime = millis() + durationMs;
    oledShowingTemp = true;
    lastOledActivity = millis();
}

void wakeOled() {
    if (!oledOk) return;
    oledCmd(SSD1306_DISPLAYON);
    oledAwake = true;
    inputs.setDisplayAwake(true);
    lastOledActivity = millis();
    drawMainScreen();
}

void sleepOled() {
    if (!oledOk) return;
    inputs.setDisplayAwake(false);   // first: a press from now on is a wake-only press
    oledCmd(SSD1306_DISPLAYOFF);
    oledAwake = false;
}

void registerActivity() {
    lastOledActivity = millis();
    if (!oledAwake) wakeOled();
}

// --- BEEP / ALARM (see Buzzer.cpp) ---
// Thin wrapper kept so existing call sites are unchanged. Rejected (ignored) while an emergency
// alarm is running.
void startBeeps(int count, int duration, int gap) {
    buzzer.beep((uint8_t)count, (uint16_t)duration, (uint16_t)gap);
}

// --- AUDIO LOGIC ---
void initPDM() {
    i2s_config_t cfg = {
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
    i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);
    i2s_pin_config_t pins = {
        .bck_io_num = I2S_PIN_NO_CHANGE,
        .ws_io_num = I2S_PDM_CLK,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_PDM_DATA
    };
    i2s_set_pin(I2S_NUM_0, &pins);
}

bool uploadAudioToBackend(uint8_t* data, size_t length) {
    HTTPClient http;
    String url = String(BACKEND_URL) + "/api/trips/voice/upload?busId=" + BUS_ID + "&sampleRate=" + String(SAMPLE_RATE);
    http.begin(url);
    http.addHeader("Content-Type", "application/octet-stream");
    http.setTimeout(20000);
    int code = http.POST(data, length);
    http.end();
    return (code >= 200 && code < 300);
}

void startAudioRecording() {
    if (audioState != AUDIO_IDLE) return;
    size_t totalBytes = SAMPLE_RATE * RECORD_SECONDS * BYTES_PER_SAMPLE;
    audioBuffer = (int16_t*)ps_malloc(totalBytes);
    if (!audioBuffer) {
        showTempMessage("NO PSRAM", "Cannot record", 3000);
        return;
    }
    samplesCaptured = 0;
    audioState = AUDIO_RECORDING;
    audioStateStart = millis();
    lastOledProgressUpdate = millis();
}

void updateAudioRecording() {
    if (audioState == AUDIO_IDLE) return;
    unsigned long now = millis();

    if (audioState == AUDIO_RECORDING) {
        size_t bytesRead = 0;
        size_t totalSamples = SAMPLE_RATE * RECORD_SECONDS;
        size_t bytesToRead = (totalSamples - samplesCaptured) * BYTES_PER_SAMPLE;
        if (bytesToRead > 2048) bytesToRead = 2048;
        i2s_read(I2S_NUM_0, (void*)((uint8_t*)audioBuffer + samplesCaptured * BYTES_PER_SAMPLE), bytesToRead, &bytesRead, portMAX_DELAY);
        samplesCaptured += (bytesRead / BYTES_PER_SAMPLE);

        if (now - lastOledProgressUpdate > 1000) {
            lastOledProgressUpdate = now;
            int progress = (samplesCaptured * 100) / totalSamples;
            display.clearDisplay();
            display.setCursor(0, 0);
            display.println("RECORDING...");
            display.print("Progress: ");
            display.print(progress);
            display.println("%");
            oledPush();
        }

        if (samplesCaptured >= totalSamples || (now - audioStateStart > RECORD_SECONDS * 1000 + 3000)) {
            audioState = AUDIO_UPLOADING;
            display.clearDisplay();
            display.println("UPLOADING...");
            oledPush();
        }
    }
    else if (audioState == AUDIO_UPLOADING) {
        bool success = uploadAudioToBackend((uint8_t*)audioBuffer, SAMPLE_RATE * RECORD_SECONDS * BYTES_PER_SAMPLE);
        showTempMessage(success ? "AUDIO SENT!" : "UPLOAD FAILED", "", 3000);
        audioState = AUDIO_IDLE;
        free(audioBuffer);
        audioBuffer = nullptr;
    }
}

// --- API LOGIC ---
void apiStartTrip() {
    HTTPClient http;
    String url = String(BACKEND_URL) + "/api/trips/start";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"busId\":\"" + BUS_ID + "\",\"operatorUid\":\"operator-bus\"}";
    int code = http.POST(payload);
    http.end();

    if (code == 201) {
        tripActive = true;
        showTempMessage("TRIP STARTED", "Success", 2000);
        startBeeps(1, 200, 100);
    } else {
        showTempMessage("FAILED", "Code: " + String(code), 2000);
    }
}

void apiEndTrip() {
    HTTPClient http;
    String url = String(BACKEND_URL) + "/api/trips/end";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"busId\":\"" + BUS_ID + "\"}";
    int code = http.POST(payload);
    http.end();

    if (code == 200) {
        tripActive = false;
        showTempMessage("TRIP ENDED", "Success", 2000);
        startBeeps(2, 100, 100);
    } else {
        showTempMessage("FAILED", "Code: " + String(code), 2000);
    }
}

// --- SETTINGS LOGIC ---
void saveBrightness(int val) {
    preferences.begin("smartbus", false);
    preferences.putInt("brightness", val);
    preferences.end();
    brightnessValue = val;
    oledCmd(SSD1306_SETCONTRAST);
    oledCmd(val);
}

void saveRecDur(int val) {
    preferences.begin("smartbus", false);
    preferences.putInt("recDuration", val);
    preferences.end();
    RECORD_SECONDS = val;
}

void clearAllData() {
    preferences.begin("smartbus", false);
    preferences.clear();
    preferences.end();
    showTempMessage("DATA CLEARED", "Rebooting...", 2000);
    delay(2000);
    ESP.restart();
}

// --- MENU DRAWING ---
void drawCurrentScreen() {
    if (!oledOk || !oledAwake) return;

    if (currentScreen == SCREEN_MAIN) {
        String items[] = {"1. Bus Info", "2. Voice Msgs", "3. Trips", "4. Settings"};
        drawMenu("MAIN MENU", items, 4);
    }
    else if (currentScreen == SCREEN_BUS_INFO) {
        display.clearDisplay();
        display.setCursor(0, 0);
        display.println("BUS INFO");
        display.println("");
        display.print("ID: "); display.println(BUS_ID);
        display.print("IP: "); display.println(WiFi.localIP().toString());
        display.print("GPS: "); display.print(gps.getSatellites()); display.println(" sats");
        display.setCursor(0, 56);
        display.println("[SELECT to Back]");
        oledPush();
    }
    else if (currentScreen == SCREEN_VOICE) {
        String items[] = {"1. Record New", "2. Back"};
        drawMenu("VOICE MESSAGES", items, 2);
    }
    else if (currentScreen == SCREEN_TRIPS) {
        String items[] = {tripActive ? "1. End Trip" : "1. Start Trip", "2. Passenger List", "3. Back"};
        drawMenu("TRIPS", items, 3);
    }
    else if (currentScreen == SCREEN_PASSENGERS) {
        display.clearDisplay();
        display.setCursor(0, 0);
        display.println("PASSENGERS");
        if (recentNamesCount == 0) {
            display.println("No scans yet.");
        } else {
            for (int i = 0; i < recentNamesCount && i < 5; i++) {
                display.println(recentNames[i]);
            }
        }
        display.setCursor(0, 56);
        display.println("[SELECT to Back]");
        oledPush();
    }
    else if (currentScreen == SCREEN_SETTINGS) {
        String items[] = {"1. Brightness", "2. Rec Duration", "3. Clear All", "4. Reboot", "5. Back"};
        drawMenu("SETTINGS", items, 5);
    }
    else if (currentScreen == SCREEN_ADJUST_BRIGHTNESS) {
        display.clearDisplay();
        display.setCursor(0, 0);
        display.println("Brightness");
        display.setCursor(0, 20);
        display.print("< ");
        display.print(pendingBrightness);
        display.println(" >");
        display.setCursor(0, 56);
        display.println("SELECT to Save");
        oledPush();
        oledCmd(SSD1306_SETCONTRAST);
        oledCmd(pendingBrightness);
    }
    else if (currentScreen == SCREEN_ADJUST_REC_DUR) {
        display.clearDisplay();
        display.setCursor(0, 0);
        display.println("Rec Duration");
        display.setCursor(0, 20);
        display.print("< ");
        display.print(pendingRecDur);
        display.println("s >");
        display.setCursor(0, 56);
        display.println("SELECT to Save");
        oledPush();
    }
    else if (currentScreen == SCREEN_CONFIRM_CLEAR) {
        display.clearDisplay();
        display.setCursor(0, 0);
        display.println("CLEAR ALL DATA?");
        display.println("");
        display.println("This erases WiFi,");
        display.println("Bus ID, Settings");
        display.setCursor(0, 40);
        display.println("SHORT: Cancel");
        display.println("LONG: Wipe all");
        oledPush();
    }
}

// --- BUTTON HANDLER ---
// CHANGED: BTN_SELECT now does the short-press action directly.
//          BTN_SELECT_LONG handles the "back to main" behavior.
//          BTN_SELECT_RELEASE is a no-op (state is reset in buttonTask).
//          The old selectWasPressed/selectPressStart logic is gone.
// Emergency sequence. Triggered by BTN_EMERGENCY, which the input task produces after a debounced,
// CONTINUOUS 3 s hold (one event per hold; release re-arms). It does not depend on the OLED state.
// NOTE (Phase 2): the HTTP + GSM parts below still block loop(); the detection no longer does.
void handleEmergency() {
    Diag::crumb("emergency: start");
    // Alarm FIRST: it runs in its own task, so it is not delayed by the HTTP/GSM calls below and
    // is not affected by releasing the emergency button.
    buzzer.startEmergency();

    if (oledOk) {
        registerActivity();
        display.clearDisplay();
        display.setTextSize(2);
        display.setCursor(0, 0);
        display.println("EMERGENCY!");
        oledPush();
        oledShowingTemp = true;
        oledRestoreTime = millis() + 5000;
    }

    bool fix = gps.hasFix();
    String latStr = fix ? String(gps.getLat(), 6) : "0.0";
    String lngStr = fix ? String(gps.getLng(), 6) : "0.0";
    if (!fix) Serial.println("[EMERGENCY] no valid GPS fix: location unknown");
    String eventId = "";
    if (net.isConnected()) {
        Diag::crumb("emergency: backend");
        eventId = net.postEmergency(BUS_ID, latStr.toDouble(), lngStr.toDouble());
    }
    Diag::crumb("emergency: gsm");
    gsm.triggerEmergency(BUS_ID, latStr, lngStr);
    if (eventId != "") {
        net.postAlertStatus(eventId, "delivered");
    }
    Diag::crumb("emergency: done");

    // Anything pressed while the sequence was blocking is stale: discard it (also prevents a
    // duplicate emergency from a hold that straddled the blocking period).
    if (buttonQueue != NULL) xQueueReset(buttonQueue);
}

static void showMainMenu() {
    currentScreen = SCREEN_MAIN;
    menuCursor = 0;
    menuScroll = 0;
    drawCurrentScreen();
    lastOledActivity = millis();
}

void processButtonEvent(ButtonEvent ev) {
    // Emergency works even if the OLED failed to initialise or is asleep.
    if (ev == BTN_EMERGENCY) {
        handleEmergency();
        return;
    }

    if (!oledOk) return;

    // First-press rules (identical for UP, DOWN and SELECT), see UiPolicy.h. The input task already
    // replaces the normal event with BTN_WAKE when the display sleeps; classifyNavEvent() also covers
    // the display going to sleep between the press and this handler, and the home/boot screen.
    switch (classifyNavEvent(ev, oledAwake, homeVisible)) {
        case PRESS_WAKE_TO_MENU:
            wakeOled();
            showMainMenu();
            return;
        case PRESS_DISMISS_HOME:
            showMainMenu();
            return;
        case PRESS_IGNORE:
            return;
        case PRESS_NORMAL:
            break;
    }

    registerActivity();          // every handled press restarts the 20 s inactivity timer

    if (ev == BTN_SELECT_LONG) {
        // Long-press = go back to main (except on main itself, or while adjusting
        // a numeric value, where long-press is intentionally inert to avoid losing
        // the pending value).
        if (currentScreen != SCREEN_MAIN &&
            currentScreen != SCREEN_ADJUST_BRIGHTNESS &&
            currentScreen != SCREEN_ADJUST_REC_DUR) {
            currentScreen = SCREEN_MAIN;
            menuCursor = 0;
            drawCurrentScreen();
        }
        startBeeps(1, 100, 50);
        return;
    }

    if (ev == BTN_UP) {
        if (currentScreen == SCREEN_ADJUST_BRIGHTNESS) {
            pendingBrightness = min(255, pendingBrightness + 10);
            drawCurrentScreen();
        } else if (currentScreen == SCREEN_ADJUST_REC_DUR) {
            pendingRecDur = min(60, pendingRecDur + 5);
            drawCurrentScreen();
        } else if (currentScreen == SCREEN_PASSENGERS) {
            if (menuCursor > 0) { menuCursor--; drawCurrentScreen(); }
        } else if (currentScreen != SCREEN_BUS_INFO && currentScreen != SCREEN_CONFIRM_CLEAR) {
            if (menuCursor > 0) { menuCursor--; drawCurrentScreen(); }
        }
        registerActivity();
    }
    else if (ev == BTN_DOWN) {
        if (currentScreen == SCREEN_ADJUST_BRIGHTNESS) {
            pendingBrightness = max(0, pendingBrightness - 10);
            drawCurrentScreen();
        } else if (currentScreen == SCREEN_ADJUST_REC_DUR) {
            pendingRecDur = max(10, pendingRecDur - 5);
            drawCurrentScreen();
        } else if (currentScreen == SCREEN_PASSENGERS) {
            if (menuCursor < recentNamesCount - 1) { menuCursor++; drawCurrentScreen(); }
        } else if (currentScreen != SCREEN_BUS_INFO && currentScreen != SCREEN_CONFIRM_CLEAR) {
            int maxItems = 0;
            if (currentScreen == SCREEN_MAIN) maxItems = 4;
            else if (currentScreen == SCREEN_VOICE) maxItems = 2;
            else if (currentScreen == SCREEN_TRIPS) maxItems = 3;
            else if (currentScreen == SCREEN_SETTINGS) maxItems = 5;
            if (menuCursor < maxItems - 1) { menuCursor++; drawCurrentScreen(); }
        }
        registerActivity();
    }
    else if (ev == BTN_SELECT) {
        // Short press: activate current menu item. Same per-screen logic as before.
        if (currentScreen == SCREEN_MAIN) {
            if (menuCursor == 0) currentScreen = SCREEN_BUS_INFO;
            else if (menuCursor == 1) currentScreen = SCREEN_VOICE;
            else if (menuCursor == 2) currentScreen = SCREEN_TRIPS;
            else if (menuCursor == 3) currentScreen = SCREEN_SETTINGS;
            menuCursor = 0; menuScroll = 0;
            drawCurrentScreen();
        }
        else if (currentScreen == SCREEN_BUS_INFO) {
            currentScreen = SCREEN_MAIN;
            menuCursor = 0;
            drawCurrentScreen();
        }
        else if (currentScreen == SCREEN_VOICE) {
            if (menuCursor == 0) { startAudioRecording(); }
            else { currentScreen = SCREEN_MAIN; menuCursor = 0; drawCurrentScreen(); }
        }
        else if (currentScreen == SCREEN_TRIPS) {
            if (menuCursor == 0) {
                if (tripActive) apiEndTrip(); else apiStartTrip();
                delay(1000);
                drawCurrentScreen();
            }
            else if (menuCursor == 1) {
                currentScreen = SCREEN_PASSENGERS;
                menuCursor = 0;
                drawCurrentScreen();
            }
            else { currentScreen = SCREEN_MAIN; menuCursor = 0; drawCurrentScreen(); }
        }
        else if (currentScreen == SCREEN_PASSENGERS) {
            currentScreen = SCREEN_TRIPS;
            menuCursor = 1;
            drawCurrentScreen();
        }
        else if (currentScreen == SCREEN_SETTINGS) {
            if (menuCursor == 0) {
                pendingBrightness = brightnessValue;
                currentScreen = SCREEN_ADJUST_BRIGHTNESS;
                drawCurrentScreen();
            }
            else if (menuCursor == 1) {
                pendingRecDur = RECORD_SECONDS;
                currentScreen = SCREEN_ADJUST_REC_DUR;
                drawCurrentScreen();
            }
            else if (menuCursor == 2) {
                currentScreen = SCREEN_CONFIRM_CLEAR;
                drawCurrentScreen();
            }
            else if (menuCursor == 3) {
                ESP.restart();
            }
            else { currentScreen = SCREEN_MAIN; menuCursor = 0; drawCurrentScreen(); }
        }
        else if (currentScreen == SCREEN_ADJUST_BRIGHTNESS) {
            saveBrightness(pendingBrightness);
            currentScreen = SCREEN_SETTINGS;
            menuCursor = 0;
            drawCurrentScreen();
        }
        else if (currentScreen == SCREEN_ADJUST_REC_DUR) {
            saveRecDur(pendingRecDur);
            currentScreen = SCREEN_SETTINGS;
            menuCursor = 1;
            drawCurrentScreen();
        }
        registerActivity();
    }
}

// --- SETUP ---
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n========================================");
    Serial.println("UFTB SmartBus - FULL SYSTEM");
    Serial.println("========================================");

    Diag::begin();                 // reset reason / boot count / last stage (before any hardware init)
    Diag::crumb("setup: resMgr");
    resMgr.begin();
    buzzer.begin();                // GPA4 owner: forces OFF, starts BuzzerTask

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
        oledPush();
    }

    Diag::crumb("setup: inputs");
    inputs.begin();

    // Queue + input task start here so the emergency button is monitored from now on (also during
    // the long Wi-Fi/portal phase of setup). Events are consumed by loop() after setup().
    buttonQueue = xQueueCreate(16, sizeof(ButtonEvent));
    if (buttonQueue == NULL) {
        Serial.println("[ERROR] Failed to create button queue!");
    } else if (!inputs.startTask(buttonQueue, 3, 0)) {
        Serial.println("[ERROR] Input task not running: buttons and emergency are DISABLED");
    }

    // Factory reset only if SELECT is held continuously for 1.5 s at boot (a spurious/short read cannot wipe NVS).
    if (inputs.bootSelectHeld(1500)) {
        Serial.println("[FACTORY RESET] Wiping memory...");
        preferences.begin("smartbus", false);
        preferences.clear();
        preferences.end();
        delay(2000);
        ESP.restart();
    }

    preferences.begin("smartbus", false);
    BUS_ID = preferences.getString("busId", "");
    brightnessValue = preferences.getInt("brightness", 128);
    RECORD_SECONDS = preferences.getInt("recDuration", 30);
    preferences.end();

    Serial.printf("[BOOT] busId from NVS: '%s'\n", BUS_ID.c_str());

    // --- CRITICAL: SETUP MODE ---
    // (unchanged: portal + Bus ID form when no Bus ID is stored)
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
            oledPush();
        }

        server.on("/", HTTP_GET, [&]() {
            String html = "<html><body><h2>SmartBus Setup</h2>";
            html += "<form action='/save' method='GET'>";
            html += "Bus ID: <input type='text' name='busId' required><br><br>";
            html += "<input type='submit' value='Save & Reboot'></form></body></html>";
            server.send(200, "text/html", html);
        });

        // CHANGED: B2 — begin/putString/read-back/end, verify write, don't reboot on failure.
        server.on("/save", HTTP_GET, [&]() {
            if (!server.hasArg("busId")) {
                server.send(400, "text/plain", "Missing busId");
                return;
            }

            String rawId = server.arg("busId");
            rawId.trim(); rawId.toUpperCase();
            rawId.replace("BUS-", ""); rawId.replace("BUS", "");
            char formattedId[10];
            sprintf(formattedId, "BUS-%02d", rawId.toInt());
            String newId = String(formattedId);

            preferences.begin("smartbus", false);
            size_t written = preferences.putString("busId", newId);
            // B2: read back to confirm NVS actually accepted the value
            String readBack = preferences.getString("busId", "");
            preferences.end();

            Serial.printf("[NVS] putString returned %u bytes, readback='%s' (wanted '%s')\n",
                          (unsigned)written, readBack.c_str(), newId.c_str());

            bool ok = (written == newId.length()) && (readBack == newId);
            if (!ok) {
                // Do NOT reboot. Show the error on the OLED so the user can see why.
                if (oledOk) {
                    display.clearDisplay();
                    display.setCursor(0, 0);
                    display.println("NVS WRITE FAILED");
                    display.println("");
                    display.println("Check flash.");
                    display.println("Retry in browser.");
                    oledPush();
                }
                server.send(500, "text/html",
                    "<h1 style='color:red;'>NVS WRITE FAILED</h1>"
                    "<p>Bus ID was not saved to flash. Try again.</p>"
                    "<p><a href='/'>Retry</a></p>");
                return;
            }

            BUS_ID = newId;
            server.send(200, "text/html", "<h1 style='color:green;'>Success! Rebooting...</h1>");
            delay(3000);
            ESP.restart();
        });

        server.begin();
        while (true) { server.handleClient(); delay(10); }
    }

    // --- IF WE GET HERE, BUS_ID EXISTS. CONNECT TO WIFI ---
    // CHANGED: C — use WiFiManager::autoConnect() so stored 'wm' credentials are used,
    //          with a bounded connect timeout and a fallback portal if they fail.
    Serial.println("[WiFi] Connecting via WiFiManager autoConnect...");
    {
        WiFiManager wifiManager;
        wifiManager.setConnectTimeout(20);         // seconds
        wifiManager.setConfigPortalTimeout(180);   // seconds
        bool connected = wifiManager.autoConnect("SmartBus-Setup");
        if (connected) {
            Serial.print("[WiFi] Connected! IP: ");
            Serial.println(WiFi.localIP());
        } else {
            Serial.println("[WiFi] autoConnect failed; continuing without network.");
        }
    }

    // --- NOW INITIALIZE EVERYTHING ELSE ---
    if (oledOk) {
        oledCmd(SSD1306_SETCONTRAST);
        oledCmd(brightnessValue);
    }

    drawMainScreen();

    Serial.println("[SETUP] Operating as: " + BUS_ID);

    Wire.setClock(100000);     // unchanged from your original
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

    Diag::crumb("setup: gps");
    gps.begin();                  // GPS on Serial1 (GPIO44), own drain task. GSM is on Serial2.

    // Presses made during the (possibly long) setup are stale; only an emergency hold is kept.
    if (buttonQueue != NULL) {
        ButtonEvent pending;
        bool emergencyPending = false;
        while (xQueueReceive(buttonQueue, &pending, 0) == pdTRUE) {
            if (pending == BTN_EMERGENCY) emergencyPending = true;
        }
        if (emergencyPending) {
            Serial.println("[EMERGENCY] hold detected during boot: handling now");
            handleEmergency();
        }
    }

    Diag::printHeap("setup-done");
    Diag::crumb("loop");
    Serial.println("========================================\n");
}

// --- LOOP ---
void loop() {
    // loop() latency diagnostics: a long iteration delays UI event handling (not button detection).
    static uint32_t lastLoopStart = 0;
    static uint32_t maxLoopGapMs = 0;
    {
        uint32_t t = millis();
        if (lastLoopStart != 0 && (t - lastLoopStart) > maxLoopGapMs) maxLoopGapMs = t - lastLoopStart;
        lastLoopStart = t;
    }

    ArduinoOTA.handle();

    if (oledOk && oledAwake && !oledShowingTemp && audioState == AUDIO_IDLE) {
        if (millis() - lastOledActivity > OLED_TIMEOUT_MS) {
            sleepOled();
        }
    }

    if (oledOk && oledShowingTemp && millis() > oledRestoreTime) {
        drawMainScreen();
    }

    // --- PROCESS BUTTON EVENTS FROM QUEUE ---
    ButtonEvent ev;
    while (buttonQueue != NULL && xQueueReceive(buttonQueue, &ev, 0) == pdTRUE) {
        processButtonEvent(ev);
    }

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
        showTempMessage("NEW REQUEST:", mqttRequestMessage, 5000);
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
            String studentName = net.postAttendance(uid, "BOARDING", BUS_ID);
            if (studentName != "") {
                if (recentNamesCount < 10) {
                    recentNames[recentNamesCount++] = studentName;
                } else {
                    for (int i = 0; i < 9; i++) recentNames[i] = recentNames[i+1];
                    recentNames[9] = studentName;
                }
            }
        }
    }

    // --- EMERGENCY BUTTON ---
    // Detection (debounce + continuous 3 s hold + re-arm on release) is done by InputManager's task;
    // it arrives as BTN_EMERGENCY through buttonQueue and is handled in processButtonEvent().

    static unsigned long lastGps = 0;
    if (millis() - lastGps > 5000 && audioState == AUDIO_IDLE) {
        lastGps = millis();
        if (gps.hasFix() && net.isConnected()) {
            net.postGPS(BUS_ID, gps.getLat(), gps.getLng(), gps.getSpeed(), (gps.getSpeed() > 2.0) ? "Moving" : "Stopped");
        }
    }

    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 10000) {
        lastHeartbeat = millis();
        Serial.printf("[Status] %s | WiFi: %s | OLED: %d (awake=%d)\n", BUS_ID.c_str(), net.getStatus().c_str(), oledOk, (int)oledAwake);
        InputStats is = inputs.getStats();
        I2CStats i2 = resMgr.getI2CStats();
        Serial.printf("[Input] healthy=%d raw=0x%02X polls=%lu readFail=%lu maxGap=%lums up=%lu down=%lu sel=%lu long=%lu wake=%lu emerg=%lu qDrop=%lu stackFree=%luB\n",
                      (int)is.healthy, is.lastRaw, (unsigned long)is.polls, (unsigned long)is.readFailures,
                      (unsigned long)is.maxPollGapMs, (unsigned long)is.upCount, (unsigned long)is.downCount,
                      (unsigned long)is.selectShort, (unsigned long)is.selectLong, (unsigned long)is.wakeCount,
                      (unsigned long)is.emergencyCount, (unsigned long)is.queueDrops, (unsigned long)is.stackFreeBytes);
        Serial.printf("[I2C] lockTimeouts=%lu mcpReadFail=%lu mcpWriteFail=%lu mcpReconfig=%lu oledSkipped=%lu | loopMaxGap=%lums\n",
                      (unsigned long)i2.lockTimeouts, (unsigned long)i2.mcpReadFail, (unsigned long)i2.mcpWriteFail,
                      (unsigned long)i2.mcpReconfig, (unsigned long)oledPushSkipped, (unsigned long)maxLoopGapMs);
        BuzzerStats bz = buzzer.getStats();
        Serial.printf("[Buzzer] alarmState=%d beeps=%lu rejected=%lu emergencies=%lu ignored=%lu guardTrips=%lu writeFails=%lu\n",
                      (int)buzzer.alarmState(), (unsigned long)bz.beepRequests, (unsigned long)bz.beepsRejected,
                      (unsigned long)bz.emergencyStarts, (unsigned long)bz.emergencyIgnored,
                      (unsigned long)bz.guardTrips, (unsigned long)bz.writeFails);
        Serial.printf("[GPS] %s\n", gps.diagLine().c_str());
        Diag::printHeap("hb");
        maxLoopGapMs = 0;
    }
}