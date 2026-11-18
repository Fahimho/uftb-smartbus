#include "GPSManager.h"

static const uint32_t GPS_POLL_MS       = 40;     // 9600 baud ~ 960 B/s -> <= ~40 B per poll
static const uint32_t FIX_MAX_AGE_MS    = 5000;   // NEO-6M reports at 1 Hz
static const uint32_t NO_DATA_AFTER_MS  = 3000;
static const uint16_t RX_BUFFER_BYTES   = 1024;

GPSManager::GPSManager(int8_t rx, int8_t tx)
    : gpsSerial(Serial1), rxPin(rx), txPin(tx),
      taskHandle(nullptr), mux(portMUX_INITIALIZER_UNLOCKED),
      started(false), totalBytes(0), lastByteMs(0), sentencesOk(0), sentencesBad(0), startedAtMs(0) {
    memset(&snap, 0, sizeof(snap));
}

bool GPSManager::begin() {
    if (started) return true;

    // Serial1 belongs to the GPS only. (GSM = Serial2, USB console = USB-CDC.)
    gpsSerial.setRxBufferSize(RX_BUFFER_BYTES);              // must precede begin()
    gpsSerial.begin(9600, SERIAL_8N1, rxPin, txPin);         // NEO-6M default 9600 baud, TX pin unused (-1)
    startedAtMs = millis();
    Serial.printf("[GPS] UART1 started: RX=GPIO%d TX=%d 9600 baud, RX buffer %u B\n",
                  (int)rxPin, (int)txPin, (unsigned)RX_BUFFER_BYTES);

    BaseType_t ok = xTaskCreatePinnedToCore(taskEntry, "GpsTask", 4096, this, 2, &taskHandle, 0);
    if (ok != pdPASS) {
        taskHandle = nullptr;
        Serial.println("[ERROR] Failed to create GpsTask!");
        return false;
    }
    started = true;
    return true;
}

void GPSManager::taskEntry(void* arg) {
    static_cast<GPSManager*>(arg)->taskLoop();
}

void GPSManager::taskLoop() {
    TickType_t wake = xTaskGetTickCount();
    const TickType_t period = max((TickType_t)1, (TickType_t)pdMS_TO_TICKS(GPS_POLL_MS));
    Status lastLogged = GPS_NOT_STARTED;
    uint32_t lastNoDataLog = 0;

    for (;;) {
        vTaskDelayUntil(&wake, period);

        bool gotBytes = false;
        while (gpsSerial.available() > 0) {
            int c = gpsSerial.read();
            if (c < 0) break;
            gotBytes = true;
            totalBytes = totalBytes + 1;
            gps.encode((char)c);
        }

        uint32_t now = millis();
        if (gotBytes) lastByteMs = now;

        if (gotBytes) {
            Snapshot s;
            s.locValid = gps.location.isValid();
            s.locUpdatedAtMs = s.locValid ? (now - gps.location.age()) : 0;
            s.lat = gps.location.lat();
            s.lng = gps.location.lng();
            s.speedKmph = gps.speed.isValid() ? gps.speed.kmph() : 0.0;
            s.sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
            s.hdopValid = gps.hdop.isValid();
            s.hdop = s.hdopValid ? gps.hdop.hdop() : 0.0;

            portENTER_CRITICAL(&mux);
            snap = s;
            portEXIT_CRITICAL(&mux);

            sentencesOk = gps.passedChecksum();
            sentencesBad = gps.failedChecksum();
        }

        // Diagnostics: log state transitions, and a reminder while there is no data.
        Status st = getStatus();
        if (st != lastLogged) {
            const char* names[] = {"NOT_STARTED", "NO_DATA", "NO_FIX", "FIX"};
            Serial.printf("[GPS] status -> %s (%s)\n", names[st], diagLine().c_str());
            lastLogged = st;
        } else if (st == GPS_NO_DATA && now - lastNoDataLog > 15000) {
            lastNoDataLog = now;
            Serial.printf("[GPS] no NMEA data on GPIO%d: check GPS TX->ESP RX wiring, power, 9600 baud\n", (int)rxPin);
        }
    }
}

GPSManager::Status GPSManager::getStatus() {
    if (!started) return GPS_NOT_STARTED;
    uint32_t now = millis();
    if (totalBytes == 0 || (now - lastByteMs) > NO_DATA_AFTER_MS) {
        // give the module a moment after boot before declaring "no data"
        if (totalBytes == 0 && (now - startedAtMs) < NO_DATA_AFTER_MS) return GPS_NO_FIX;
        return GPS_NO_DATA;
    }
    return hasFix() ? GPS_FIX : GPS_NO_FIX;
}

bool GPSManager::hasFix() {
    Snapshot s;
    portENTER_CRITICAL(&mux);
    s = snap;
    portEXIT_CRITICAL(&mux);
    return s.locValid && (millis() - s.locUpdatedAtMs) < FIX_MAX_AGE_MS;
}

double GPSManager::getLat() {
    Snapshot s; portENTER_CRITICAL(&mux); s = snap; portEXIT_CRITICAL(&mux);
    return s.lat;
}
double GPSManager::getLng() {
    Snapshot s; portENTER_CRITICAL(&mux); s = snap; portEXIT_CRITICAL(&mux);
    return s.lng;
}
double GPSManager::getSpeed() {
    Snapshot s; portENTER_CRITICAL(&mux); s = snap; portEXIT_CRITICAL(&mux);
    return s.speedKmph;
}
int GPSManager::getSatellites() {
    Snapshot s; portENTER_CRITICAL(&mux); s = snap; portEXIT_CRITICAL(&mux);
    return (int)s.sats;
}

String GPSManager::diagLine() {
    Snapshot s; portENTER_CRITICAL(&mux); s = snap; portEXIT_CRITICAL(&mux);
    uint32_t now = millis();
    char buf[160];
    snprintf(buf, sizeof(buf), "bytes=%lu nmeaOK=%lu nmeaBad=%lu sats=%lu fix=%d age=%lums lastByte=%lums ago",
             (unsigned long)totalBytes, (unsigned long)sentencesOk, (unsigned long)sentencesBad,
             (unsigned long)s.sats, (int)(s.locValid && (now - s.locUpdatedAtMs) < FIX_MAX_AGE_MS),
             (unsigned long)(s.locValid ? now - s.locUpdatedAtMs : 0),
             (unsigned long)(totalBytes ? now - lastByteMs : 0));
    return String(buf);
}
