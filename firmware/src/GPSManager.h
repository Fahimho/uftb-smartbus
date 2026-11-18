#pragma once
#include <Arduino.h>
#include <TinyGPSPlus.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

// NEO-6M on its OWN hardware UART (Serial1). The SIM800L uses Serial2.
// A small task drains the UART continuously (the old code drained it every 5 s into a
// 256-byte buffer, which overflowed). Consumers read a consistent snapshot.
class GPSManager {
public:
    enum Status : uint8_t {
        GPS_NOT_STARTED = 0,
        GPS_NO_DATA,        // UART up, no NMEA bytes (wiring / power / baud)
        GPS_NO_FIX,         // NMEA flowing, no valid position
        GPS_FIX             // valid, recent position
    };

    GPSManager(int8_t rxPin, int8_t txPin);

    bool begin();           // configures Serial1 and starts the drain task
    void update() {}        // kept for source compatibility: the task does the work now

    bool hasFix();          // valid location AND updated within the last 5 s
    double getLat();
    double getLng();
    double getSpeed();      // km/h
    int getSatellites();

    Status getStatus();
    String diagLine();      // one-line summary for the heartbeat log

private:
    struct Snapshot {
        bool     locValid;
        uint32_t locUpdatedAtMs;   // millis() of the last location update
        double   lat, lng, speedKmph;
        uint32_t sats;
        double   hdop;
        bool     hdopValid;
    };

    TinyGPSPlus gps;                // touched only by the GPS task
    HardwareSerial& gpsSerial;
    int8_t rxPin;
    int8_t txPin;

    TaskHandle_t taskHandle;
    portMUX_TYPE mux;
    Snapshot snap;
    volatile bool started;
    volatile uint32_t totalBytes;
    volatile uint32_t lastByteMs;
    volatile uint32_t sentencesOk;
    volatile uint32_t sentencesBad;
    volatile uint32_t startedAtMs;

    static void taskEntry(void* arg);
    void taskLoop();
};
