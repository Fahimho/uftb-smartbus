#include "Sim800Manager.h"

Sim800Manager::Sim800Manager(int rxPin, int txPin) {
    _rxPin = rxPin;
    _txPin = txPin;
    _serial = &Serial1; // Use Hardware Serial 1
    _numberCount = 0;   // No numbers by default
}

void Sim800Manager::begin() {
    _serial->begin(9600, SERIAL_8N1, _rxPin, _txPin);
    delay(1000);
    sendATCommand("AT", 1000);
    sendATCommand("AT+CMGF=1", 1000); // Set SMS text mode
    sleepModem(); // Put to sleep immediately
}

void Sim800Manager::updateContacts(String numbers[], int count) {
    _numberCount = min(count, 5); // Max 5 numbers
    for (int i = 0; i < _numberCount; i++) {
        _phoneNumbers[i] = numbers[i];
    }
    Serial.printf("[SIM800] Contacts updated: %d numbers saved.\n", _numberCount);
}

void Sim800Manager::sendATCommand(String cmd, unsigned long timeout) {
    _serial->println(cmd);
    unsigned long start = millis();
    while (millis() - start < timeout) {
        if (_serial->available()) {
            String response = _serial->readString();
            if (response.indexOf("OK") >= 0 || response.indexOf("ERROR") >= 0) break;
        }
    }
}

void Sim800Manager::wakeModem() {
    Serial.println("[SIM800] Waking up modem...");
    _serial->println("AT+CSCLK=0"); // Disable sleep
    delay(500);
}

void Sim800Manager::sleepModem() {
    Serial.println("[SIM800] Putting modem to sleep...");
    _serial->println("AT+CSCLK=2"); // Enable sleep mode
}

bool Sim800Manager::waitForNetwork() {
    for (int i = 0; i < 10; i++) { // Try for 10 seconds
        _serial->println("AT+CREG?");
        delay(1000);
        if (_serial->available()) {
            String response = _serial->readString();
            if (response.indexOf(",1") >= 0 || response.indexOf(",5") >= 0) {
                return true; // Registered
            }
        }
    }
    return false;
}

bool Sim800Manager::sendSingleSMS(String phoneNumber, String message) {
    _serial->println("AT+CMGS=\"" + phoneNumber + "\"");
    delay(1000); // Wait for '>' prompt
    _serial->print(message);
    _serial->write(26); // Ctrl+Z to send
    delay(5000); // Wait for send
    return true;
}

// Triggered by the Emergency Button
void Sim800Manager::triggerEmergency(String busId, String lat, String lon) {
    if (_numberCount == 0) {
        Serial.println("[SIM800] ERROR: No emergency numbers configured!");
        return;
    }

    wakeModem();
    if (!waitForNetwork()) {
        Serial.println("[SIM800] ERROR: Could not connect to network.");
        sleepModem();
        return;
    }

    String payload = "EMERGENCY: Bus " + busId + " at " + lat + "," + lon;

    // 1. Send SMS to ALL numbers
    for (int i = 0; i < _numberCount; i++) {
        Serial.println("[SIM800] Sending SMS to " + _phoneNumbers[i]);
        sendSingleSMS(_phoneNumbers[i], payload);
    }

    // 2. Call ONLY the Primary number (index 0)
    Serial.println("[SIM800] Calling primary number: " + _phoneNumbers[0]);
    _serial->println("ATD" + _phoneNumbers[0] + ";"); // The semicolon means voice call
    delay(15000); // Let it ring for 15 seconds
    _serial->println("ATH"); // Hang up

    sleepModem();
}

// Triggered by Admin via MQTT
bool Sim800Manager::makeAdminCall(String phoneNumber) {
    wakeModem();
    if (!waitForNetwork()) {
        sleepModem();
        return false;
    }

    _serial->println("ATD" + phoneNumber + ";"); 
    delay(10000); // Let it ring for 10 seconds
    _serial->println("ATH"); // Hang up
    
    sleepModem();
    return true;
}