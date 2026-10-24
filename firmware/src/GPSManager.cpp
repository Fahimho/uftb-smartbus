#include "GPSManager.h"

GPSManager::GPSManager(uint8_t rxPin, uint8_t txPin) 
    : gpsSerial(Serial1), rxPin(rxPin), txPin(txPin) {
}

void GPSManager::begin() {
    // NEO-6M uses 9600 baud
    gpsSerial.begin(9600, SERIAL_8N1, rxPin, txPin);
    Serial.println("[GPS] Hardware Serial initialized.");
}

void GPSManager::update() {
    while (gpsSerial.available() > 0) {
        gps.encode(gpsSerial.read());
    }
}

bool GPSManager::hasFix() {
    // Requires a valid location and it must be recent (< 2.5 seconds old)
    return gps.location.isValid() && gps.location.age() < 2500;
}

double GPSManager::getLat() { return gps.location.lat(); }
double GPSManager::getLng() { return gps.location.lng(); }
double GPSManager::getSpeed() { return gps.speed.kmph(); }
int GPSManager::getSatellites() { return gps.satellites.value(); }