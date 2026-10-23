// UFTB SmartBus — Firmware entry point
// Phase 2 skeleton: proves the toolchain builds. No hardware logic yet.

#include <Arduino.h>

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println();
    Serial.println("========================================");
    Serial.println("UFTB SmartBus — Firmware Skeleton");
    Serial.println("Phase 2: toolchain check only");
    Serial.println("No hardware initialized yet.");
    Serial.println("========================================");
}

void loop() {
    static unsigned long last = 0;
    if (millis() - last > 2000) {
        last = millis();
        Serial.printf("[heartbeat] uptime=%lu ms\n", millis());
    }
    delay(10);
}