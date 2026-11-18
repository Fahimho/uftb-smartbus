#pragma once
#include <Arduino.h>
#include "esp_system.h"

// Restart diagnostics.
//  * The reset reason is captured by a static initialiser, i.e. BEFORE setup() and before any
//    peripheral is touched.
//  * A "breadcrumb" (last stage reached) and a boot counter live in RTC_NOINIT memory, which
//    survives panics, watchdog resets, brown-outs and esp_restart() (not a power cycle).
//    After an unexpected restart the log shows where the previous run was.
namespace Diag {
    void begin();                              // call right after Serial.begin()
    void crumb(const char* where);             // record the current stage (cheap, ISR-unsafe)
    esp_reset_reason_t resetReason();
    const char* resetReasonName(esp_reset_reason_t r);
    uint32_t bootCount();
    void printHeap(const char* tag);           // heap / PSRAM snapshot
}
