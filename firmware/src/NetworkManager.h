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
    bool uploadPhoto(String requestId, String base64Image);
    
    void setMessageCallback(std::function<void(String)> callback);
    void setCameraCallback(std::function<void(String)> callback);
    void setAudioCallback(std::function<void(String)> callback); 
    void setAdminCallCallback(std::function<void(String)> callback);
    void setContactsUpdateCallback(std::function<void(String)> callback);

private:
    const char* ssid;
    const char* password;
    const char* backendUrl;
    const char* mqttServer;
    
    WiFiClientSecure espClient; 
    PubSubClient mqttClient;
    
    std::function<void(String)> onMessage;
    std::function<void(String)> onCamera;
    std::function<void(String)> onAudio; 
    std::function<void(String)> onAdminCall;
    std::function<void(String)> onContactsUpdate; // <-- ADD New
    void connectMQTT();
};