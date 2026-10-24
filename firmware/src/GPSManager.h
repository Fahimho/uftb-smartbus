#pragma once
#include <Arduino.h>
#include <TinyGPSPlus.h>

class GPSManager {
public:
    GPSManager(uint8_t rxPin, uint8_t txPin);
    void begin();
    void update();
    
    bool hasFix();
    double getLat();
    double getLng();
    double getSpeed();
    int getSatellites();

private:
    TinyGPSPlus gps;
    HardwareSerial& gpsSerial;
    uint8_t rxPin;
    uint8_t txPin;
   // bool connected;
};