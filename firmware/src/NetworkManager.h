#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <functional>

class NetworkManager {
public:
    NetworkManager(const char* ssid, const char* password, const char* backendUrl, const char* mqttServer);
    void begin();
    void loopMQTT();
    bool isConnected();
    String getStatus();
    
    bool postAttendance(String uid, String type, String busId);
    bool postGPS(String busId, double lat, double lng, double speed, String status);
    bool postEmergency(String busId, double lat, double lng);
    
    void setMessageCallback(std::function<void(String)> callback);

private:
    const char* ssid;
    const char* password;
    const char* backendUrl;
    const char* mqttServer;
    
    WiFiClientSecure espClient; // <-- Changed to WiFiClientSecure
    PubSubClient mqttClient;
    std::function<void(String)> onMessage;
    void connectMQTT();
};