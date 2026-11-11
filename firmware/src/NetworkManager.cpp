#include "NetworkManager.h"

NetworkManager::NetworkManager(const char* ssid, const char* password, const char* backendUrl, const char* mqttServer)
    : mqttClient(espClient) {
    this->ssid = ssid;
    this->password = password;
    this->backendUrl = backendUrl;
    this->mqttServer = mqttServer;
    this->_busId = "UNASSIGNED"; 
}

void NetworkManager::setBusId(String busId) {
    this->_busId = busId;
}

void NetworkManager::begin() {
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[WiFi] Already Connected! IP: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("[WiFi] Not connected. WiFiManager should handle this.");
    }
}

bool NetworkManager::isConnected() { return WiFi.status() == WL_CONNECTED; }
String NetworkManager::getStatus() { return isConnected() ? "Online" : "Offline"; }

void NetworkManager::connectMQTT() {
    espClient.setInsecure(); 
    mqttClient.setServer(mqttServer, 8883); 
    
    String clientId = "BusESP32-";
    clientId += String(random(0xffff), HEX);
    
    Serial.println("[MQTT] Attempting connection as " + _busId + "...");
    
    if (mqttClient.connect(clientId.c_str(), "SMART-BUS", "uftbsmartbus@")) {
        Serial.println("[MQTT] Connected to EMQX Cloud!");
        
        mqttClient.subscribe(("smartbus/" + _busId + "/request").c_str());
        mqttClient.subscribe(("smartbus/" + _busId + "/camera").c_str());
        mqttClient.subscribe(("smartbus/" + _busId + "/audio").c_str());
        mqttClient.subscribe(("smartbus/" + _busId + "/commands").c_str());
        mqttClient.subscribe(("smartbus/" + _busId + "/contacts").c_str());

        Serial.println("[MQTT] Subscribed to topics for " + _busId);
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
        String prefix = "smartbus/" + _busId + "/";
        
        if (t.indexOf(prefix + "request") >= 0 && onMessage) {
            onMessage(message);
        } else if (t.indexOf(prefix + "camera") >= 0 && onCamera) {
            onCamera(message);
        } else if (t.indexOf(prefix + "audio") >= 0 && onAudio) {
            onAudio(message);
        } else if (t.indexOf(prefix + "commands") >= 0 && onAdminCall) {
            onAdminCall(message);
        } else if (t.indexOf(prefix + "contacts") >= 0 && onContactsUpdate) {
            onContactsUpdate(message);
        }
    });
}

void NetworkManager::setCameraCallback(std::function<void(String)> callback) {
    onCamera = callback;
}

void NetworkManager::setAudioCallback(std::function<void(String)> callback) {
    onAudio = callback;
}

void NetworkManager::setAdminCallCallback(std::function<void(String)> callback) {
    onAdminCall = callback;
}

void NetworkManager::setContactsUpdateCallback(std::function<void(String)> callback) {
    onContactsUpdate = callback;
}

// CHANGED: Returns String (student name)
String NetworkManager::postAttendance(String uid, String type, String busId) {
    if (!isConnected()) return "";
    HTTPClient http;
    String url = String(backendUrl) + "/api/trips/attendance";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"uid\":\"" + uid + "\",\"type\":\"" + type + "\",\"busId\":\"" + busId + "\"}";
    
    int httpResponseCode = http.POST(payload);
    String studentName = "";
    
    if (httpResponseCode == 201) {
        String response = http.getString();
        // Parse JSON response: {"message":"Attendance recorded","eventId":"...","studentName":"Fahim"}
        int nameStart = response.indexOf("\"studentName\":\"");
        if (nameStart > 0) {
            nameStart += 15; // Length of "studentName":"
            int nameEnd = response.indexOf("\"", nameStart);
            if (nameEnd > 0) {
                studentName = response.substring(nameStart, nameEnd);
            }
        }
    }
    
    http.end();
    return studentName;
}

bool NetworkManager::postGPS(String busId, double lat, double lng, double speed, String status) {
    if (!isConnected()) return false;
    HTTPClient http;
    String url = String(backendUrl) + "/api/trips/gps";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    String ipStr = WiFi.localIP().toString(); 
    String payload = "{\"busId\":\"" + busId + "\",\"lat\":" + String(lat, 6) + ",\"lng\":" + String(lng, 6) + ",\"speed\":" + String(speed, 1) + ",\"status\":\"" + status + "\",\"ip\":\"" + ipStr + "\"}";
    
    int httpResponseCode = http.POST(payload);
    http.end();
    return (httpResponseCode == 200);
}

String NetworkManager::postEmergency(String busId, double lat, double lng) {
    if (!isConnected()) return "";
    HTTPClient http;
    String url = String(backendUrl) + "/api/emergency/alert"; 
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\"busId\":\"" + busId + "\",\"lat\":" + String(lat, 6) + ",\"lng\":" + String(lng, 6) + "}";
    int httpResponseCode = http.POST(payload);
    
    String eventId = "";
    if (httpResponseCode == 201) {
        String response = http.getString();
        int idStart = response.indexOf("\"eventId\":\"");
        if (idStart > 0) {
            idStart += 11; 
            int idEnd = response.indexOf("\"", idStart);
            eventId = response.substring(idStart, idEnd);
            Serial.println("[HTTP] Extracted eventId: " + eventId);
        }
    }
    
    http.end();
    return eventId;
}

bool NetworkManager::postAlertStatus(String eventId, String status) {
    if (!isConnected() || eventId == "") return false;
    
    HTTPClient http;
    String url = String(backendUrl) + "/api/emergency/alert-status";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\"eventId\":\"" + eventId + "\",\"status\":\"" + status + "\"}";
    int httpResponseCode = http.POST(payload);
    http.end();
    
    Serial.printf("[WEBHOOK] Status '%s' sent for event %s. Code: %d\n", status.c_str(), eventId.c_str(), httpResponseCode);
    return (httpResponseCode == 200);
}

bool NetworkManager::uploadPhoto(String requestId, String base64Image) {
    if (!isConnected()) return false;
    HTTPClient http;
    String url = String(backendUrl) + "/api/trips/photo/upload";
    http.begin(url);
    
    http.setTimeout(20000); 
    
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"requestId\":\"" + requestId + "\",\"imageBase64\":\"" + base64Image + "\"}";
    int httpResponseCode = http.POST(payload);
    http.end();
    return (httpResponseCode == 200);
}