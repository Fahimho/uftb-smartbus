#pragma once
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include "ResourceManager.h"

// ---------------------------------------------------------------------------
// Buzzer: the ONLY owner of MCP23017 GPA4.
//
//  * Normal feedback beeps   : beep(count, onMs, gapMs)        (non-blocking)
//  * Emergency alarm         : startEmergency()                (non-blocking, has priority)
//
//      ALARM_BEEPS  : EM_BEEP_COUNT beeps, EM_BEEP_ON_MS on / EM_BEEP_OFF_MS off
//      ALARM_SOLID  : output continuously ON for exactly EM_SOLID_MS
//      ALARM_FINISHED: output OFF
//
//  While an emergency alarm is running, beep() is rejected, so a SELECT/trip/MQTT beep
//  can never interrupt it. A new startEmergency() while one is running is ignored.
//
//  Everything is driven by tick(now) from a small dedicated task (5 ms period), so the
//  timing does not depend on loop(), which can block on HTTP/GSM. No delay() anywhere.
//  Failsafe: if the output has been ON continuously for more than MAX_ON_MS, every
//  sequence is aborted and the output is forced OFF.
// ---------------------------------------------------------------------------

struct BuzzerStats {
    uint32_t beepRequests;
    uint32_t beepsRejected;      // rejected because an emergency alarm was active
    uint32_t emergencyStarts;
    uint32_t emergencyIgnored;   // start requested while already running
    uint32_t guardTrips;         // failsafe forced OFF
    uint32_t writeFails;         // I2C write failures (retried every tick)
};

class Buzzer {
public:
    enum AlarmState : uint8_t { ALARM_IDLE = 0, ALARM_BEEPS, ALARM_SOLID, ALARM_FINISHED };

    // Emergency sequence timing (ms)
    enum : uint32_t {
        EM_BEEP_COUNT  = 6,
        EM_BEEP_ON_MS  = 250,
        EM_BEEP_OFF_MS = 150,     // 6 x (250 + 150) = 2400 ms of beeping
        EM_SOLID_MS    = 2000,    // then exactly 2000 ms continuous ON, then OFF
        MAX_ON_MS      = 2600     // failsafe (longest legitimate ON period is EM_SOLID_MS)
    };

    explicit Buzzer(ResourceManager& rm);

    bool begin();                                              // forces OFF, starts the task

    // Normal feedback beeps. Replaces a running normal sequence.
    // Returns false (and does nothing) while an emergency alarm is active.
    bool beep(uint8_t count, uint16_t onMs, uint16_t gapMs);

    // Emergency alarm. Preempts normal beeps. Returns false if one is already running.
    bool startEmergency();

    bool emergencyActive();
    AlarmState alarmState();
    BuzzerStats getStats();

    void tick(uint32_t now);                                   // called by the task (and by host tests)

private:
    enum NormalPhase : uint8_t { NB_IDLE = 0, NB_GAP, NB_ON };

    ResourceManager& resMgr;
    TaskHandle_t taskHandle;
    portMUX_TYPE mux;

    // ---- state protected by `mux` ----
    AlarmState alarm;
    uint32_t aStart;            // start of current alarm phase
    uint8_t  aBeepsStarted;
    bool     aOn;               // current beep phase (ALARM_BEEPS)
    NormalPhase nbPhase;
    uint8_t  nbRemaining;
    uint16_t nbOn, nbGap;
    uint32_t nbStart;
    BuzzerStats stats;

    // ---- task-only state ----
    bool appliedKnown;          // false until a write succeeded
    bool appliedOn;
    uint32_t onSince;
    bool mcpWarned;

    bool evaluate(uint32_t now);     // caller holds `mux`; returns the wanted output level
    void apply(bool want, uint32_t now);
    static void taskEntry(void* arg);
    void taskLoop();
};
