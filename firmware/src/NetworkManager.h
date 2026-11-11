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
    
    void setBusId(String busId);
    String getBusId() { return _busId; }

    // CHANGED: Now returns String (student name) instead of bool
    String postAttendance(String uid, String type, String busId);
    
    bool postGPS(String busId, double lat, double lng, double speed, String status);
    String postEmergency(String busId, double lat, double lng);
    bool postAlertStatus(String eventId, String status);
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
    
    String _busId;
    
    WiFiClientSecure espClient; 
    PubSubClient mqttClient;
    
    std::function<void(String)> onMessage;
    std::function<void(String)> onCamera;
    std::function<void(String)> onAudio; 
    std::function<void(String)> onAdminCall;
    std::function<void(String)> onContactsUpdate;
    
    void connectMQTT();
};