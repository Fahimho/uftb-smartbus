#pragma once
#include <Arduino.h>

class Sim800Manager {
public:
    Sim800Manager(int rxPin, int txPin);
    void begin();
    
    // Called by main.cpp when MQTT receives new contacts
    void updateContacts(String numbers[], int count);
    
    // Triggered by Emergency Button (SMS to ALL, Call to PRIMARY)
    void triggerEmergency(String busId, String lat, String lon);
    
    // Triggered by Admin via MQTT (Call ONLY)
    bool makeAdminCall(String phoneNumber);
    
    void sleepModem();
    void wakeModem();

private:
    int _rxPin;
    int _txPin;
    HardwareSerial* _serial;
    
    // Contact Storage
    String _phoneNumbers[5]; // Max 5 numbers
    int _numberCount;

    void sendATCommand(String cmd, unsigned long timeout);
    bool waitForNetwork();
    bool sendSingleSMS(String phoneNumber, String message);
};