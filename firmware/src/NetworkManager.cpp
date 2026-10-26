#include "NetworkManager.h"

NetworkManager::NetworkManager(const char* ssid, const char* password, const char* backendUrl, const char* mqttServer)
    : mqttClient(espClient) {
    this->ssid = ssid;
    this->password = password;
    this->backendUrl = backendUrl;
    this->mqttServer = mqttServer;
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

void NetworkManager::connectMQTT() {
    espClient.setInsecure(); 
    mqttClient.setServer(mqttServer, 8883); 
    
    String clientId = "BusESP32-";
    clientId += String(random(0xffff), HEX);
    
    Serial.println("[MQTT] Attempting connection...");
    
    if (mqttClient.connect(clientId.c_str(), "SMART-BUS", "uftbsmartbus@")) {
        Serial.println("[MQTT] Connected to EMQX Cloud!");
        mqttClient.subscribe("smartbus/BUS-01/request");
        mqttClient.subscribe("smartbus/BUS-01/camera"); // <-- Subscribe to camera topic
        mqttClient.subscribe("smartbus/BUS-01/audio"); // <-- Subscribe to audio topic

        Serial.println("[MQTT] Subscribed to request, camera, and audio topics");
    } else {
        Serial.print("[MQTT] Failed, rc=");
        Serial.println(mqttClient.state());
    }
}

void NetworkManager::loopMQTT() {
    if (!mqttClient.connected()) {
        static unsigned long lastReconnect = 0;
        if (millis() - lastReconnect > 5000) {
            lastReconnect = millis();
            connectMQTT();
        }
    } else {
        mqttClient.loop();
    }
}

void NetworkManager::setMessageCallback(std::function<void(String)> callback) {
    onMessage = callback;
    
    mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length) {
        String message = "";
        for (unsigned int i = 0; i < length; i++) {
            message += (char)payload[i];
        }
        String t = String(topic);
        
        // Route the message based on the topic
        if (t.indexOf("request") > 0 && onMessage) {
            onMessage(message);
        } else if (t.indexOf("camera") > 0 && onCamera) {
            onCamera(message);
               } else if (t.indexOf("audio") > 0 && onAudio) {
            onAudio(message);
        }
    });
}

void NetworkManager::setCameraCallback(std::function<void(String)> callback) {
    onCamera = callback;
}

void NetworkManager::setAudioCallback(std::function<void(String)> callback) {
    onAudio = callback;
}

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
    String payload = "{\"busId\":\"" + busId + "\",\"lat\":" + String(lat, 6) + ",\"lng\":" + String(lng, 6) + ",\"speed\":" + String(speed, 1) + ",\"status\":\"" + status + "\"}";
    int httpResponseCode = http.POST(payload);
    http.end();
    return (httpResponseCode == 200);
}

bool NetworkManager::postEmergency(String busId, double lat, double lng) {
    if (!isConnected()) return false;
    HTTPClient http;
    String url = String(backendUrl) + "/api/trips/emergency";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"busId\":\"" + busId + "\",\"lat\":" + String(lat, 6) + ",\"lng\":" + String(lng, 6) + "}";
    int httpResponseCode = http.POST(payload);
    http.end();
    return (httpResponseCode == 201);
}

bool NetworkManager::uploadPhoto(String requestId, String base64Image) {
    if (!isConnected()) return false;
    HTTPClient http;
    String url = String(backendUrl) + "/api/trips/photo/upload";
    http.begin(url);
    
    // ADD THIS LINE: Give it 20 seconds to upload the large image
    http.setTimeout(20000); 
    
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"requestId\":\"" + requestId + "\",\"imageBase64\":\"" + base64Image + "\"}";
    int httpResponseCode = http.POST(payload);
    http.end();
    return (httpResponseCode == 200);
}