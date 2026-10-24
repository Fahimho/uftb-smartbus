#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

class NetworkManager {
public:
    NetworkManager(const char* ssid, const char* password, const char* backendUrl);
    void begin();
    bool isConnected();
    String getStatus();
    
    bool postAttendance(String uid, String type, String busId);
    bool postGPS(String busId, double lat, double lng, double speed, String status);
        String getPendingRequest(String busId);
private:
    const char* ssid;
    const char* password;
    const char* backendUrl;
};