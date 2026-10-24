#include "NetworkManager.h"

NetworkManager::NetworkManager(const char* ssid, const char* password, const char* backendUrl) {
    this->ssid = ssid;
    this->password = password;
    this->backendUrl = backendUrl;
}

void NetworkManager::begin() {
    Serial.print("[WiFi] Connecting to ");
    Serial.println(ssid);
    WiFi.begin(ssid, password);
    
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

bool NetworkManager::isConnected() { return WiFi.status() == WL_CONNECTED; }
String NetworkManager::getStatus() { return isConnected() ? "Online" : "Offline"; }

bool NetworkManager::postAttendance(String uid, String type, String busId) {
    if (!isConnected()) return false;

    HTTPClient http;
    String url = String(backendUrl) + "/api/trips/attendance";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    String payload = "{\"uid\":\"" + uid + "\",\"type\":\"" + type + "\",\"busId\":\"" + busId + "\"}";
    
    int httpResponseCode = http.POST(payload);
    http.end();
    return (httpResponseCode == 201);
}

bool NetworkManager::postGPS(String busId, double lat, double lng, double speed, String status) {
    if (!isConnected()) return false;

    HTTPClient http;
    String url = String(backendUrl) + "/api/trips/gps";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    String payload = "{\"busId\":\"" + busId + "\",\"lat\":" + String(lat, 6) + 
                     ",\"lng\":" + String(lng, 6) + ",\"speed\":" + String(speed, 1) + 
                     ",\"status\":\"" + status + "\"}";
    
    int httpResponseCode = http.POST(payload);
    http.end();
    return (httpResponseCode == 200);
}