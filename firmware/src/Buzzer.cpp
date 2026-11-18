#include "Buzzer.h"

static const uint32_t TICK_MS = 5;

Buzzer::Buzzer(ResourceManager& rm)
    : resMgr(rm), taskHandle(nullptr), mux(portMUX_INITIALIZER_UNLOCKED),
      alarm(ALARM_IDLE), aStart(0), aBeepsStarted(0), aOn(false),
      nbPhase(NB_IDLE), nbRemaining(0), nbOn(0), nbGap(0), nbStart(0),
      appliedKnown(false), appliedOn(false), onSince(0), mcpWarned(false) {
    memset(&stats, 0, sizeof(stats));
}

bool Buzzer::begin() {
    if (taskHandle != nullptr) return true;
    resMgr.setBuzzer(false);                       // known state at boot
    BaseType_t ok = xTaskCreatePinnedToCore(taskEntry, "BuzzerTask", 3072, this, 2, &taskHandle, 0);
    if (ok != pdPASS) {
        taskHandle = nullptr;
        Serial.println("[ERROR] Failed to create BuzzerTask: no buzzer feedback");
        return false;
    }
    Serial.println("[Task] BuzzerTask started on Core 0 (single owner of MCP GPA4)");
    return true;
}

bool Buzzer::beep(uint8_t count, uint16_t onMs, uint16_t gapMs) {
    if (count == 0) return true;
    if (count > 10) count = 10;
    if (onMs > 2000) onMs = 2000;
    if (onMs < 10) onMs = 10;
    if (gapMs > 5000) gapMs = 5000;

    bool accepted = true;
    portENTER_CRITICAL(&mux);
    stats.beepRequests++;
    if (alarm == ALARM_BEEPS || alarm == ALARM_SOLID) {
        stats.beepsRejected++;
        accepted = false;
    } else {
        nbRemaining = count;
        nbOn = onMs;
        nbGap = gapMs;
        nbPhase = NB_GAP;
        nbStart = millis() - gapMs;                 // first beep starts on the next tick
    }
    portEXIT_CRITICAL(&mux);
    return accepted;
}

bool Buzzer::startEmergency() {
    bool started = true;
    portENTER_CRITICAL(&mux);
    if (alarm == ALARM_BEEPS || alarm == ALARM_SOLID) {
        stats.emergencyIgnored++;
        started = false;
    } else {
        stats.emergencyStarts++;
        nbPhase = NB_IDLE;                           // preempt normal beeps
        nbRemaining = 0;
        alarm = ALARM_BEEPS;
        aBeepsStarted = 1;                           // first beep starts immediately
        aOn = true;
        aStart = millis();
    }
    portEXIT_CRITICAL(&mux);
    return started;
}

bool Buzzer::emergencyActive() {
    bool a;
    portENTER_CRITICAL(&mux);
    a = (alarm == ALARM_BEEPS || alarm == ALARM_SOLID);
    portEXIT_CRITICAL(&mux);
    return a;
}

Buzzer::AlarmState Buzzer::alarmState() {
    AlarmState s;
    portENTER_CRITICAL(&mux);
    s = alarm;
    portEXIT_CRITICAL(&mux);
    return s;
}

BuzzerStats Buzzer::getStats() {
    BuzzerStats s;
    portENTER_CRITICAL(&mux);
    s = stats;
    portEXIT_CRITICAL(&mux);
    return s;
}

// Wanted output level for time `now`. Called with `mux` held; no I/O in here.
bool Buzzer::evaluate(uint32_t now) {

    // Failsafe: never stay ON longer than any legitimate sequence.
    if (appliedKnown && appliedOn && (now - onSince) > MAX_ON_MS) {
        stats.guardTrips++;
        nbPhase = NB_IDLE;
        nbRemaining = 0;
        if (alarm == ALARM_BEEPS || alarm == ALARM_SOLID) alarm = ALARM_FINISHED;
        return false;
    }

    // ---------------- emergency alarm (priority) ----------------
    if (alarm == ALARM_BEEPS) {
        if (aOn) {
            if (now - aStart >= EM_BEEP_ON_MS) {
                aOn = false;
                aStart = now;
                return false;
            }
            return true;
        }
        // off-gap between beeps (also after the last beep, before the solid tone)
        if (now - aStart >= EM_BEEP_OFF_MS) {
            if (aBeepsStarted < EM_BEEP_COUNT) {
                aBeepsStarted++;
                aOn = true;
                aStart = now;
                return true;
            }
            alarm = ALARM_SOLID;
            aStart = now;
            return true;
        }
        return false;
    }

    if (alarm == ALARM_SOLID) {
        if (now - aStart >= EM_SOLID_MS) {
            alarm = ALARM_FINISHED;
            return false;
        }
        return true;
    }

    if (alarm == ALARM_FINISHED) {
        // stays OFF until startEmergency() is called again; normal beeps are allowed again
    }

    // ---------------- normal feedback beeps ----------------
    if (nbPhase == NB_ON) {
        if (now - nbStart >= nbOn) {
            nbPhase = (nbRemaining > 0) ? NB_GAP : NB_IDLE;   // the LAST beep ends here (old code never reached this)
            nbStart = now;
            return false;
        }
        return true;
    }
    if (nbPhase == NB_GAP) {
        if (now - nbStart >= nbGap) {
            nbRemaining--;
            nbPhase = NB_ON;
            nbStart = now;
            return true;
        }
        return false;
    }
    return false;
}

void Buzzer::apply(bool want, uint32_t now) {
    if (!resMgr.isMcpConnected()) {
        if (!mcpWarned) { mcpWarned = true; Serial.println("[Buzzer] MCP23017 not available: buzzer disabled"); }
        return;
    }
    if (appliedKnown && appliedOn == want) return;

    if (resMgr.setBuzzer(want)) {
        appliedKnown = true;
        appliedOn = want;
        if (want) onSince = now;
    } else {
        // retried on the next tick; an OFF request is therefore never given up
        portENTER_CRITICAL(&mux);
        stats.writeFails++;
        portEXIT_CRITICAL(&mux);
        appliedKnown = false;
    }
}

void Buzzer::tick(uint32_t now) {
    bool want;
    portENTER_CRITICAL(&mux);
    want = evaluate(now);
    portEXIT_CRITICAL(&mux);
    apply(want, now);
}

void Buzzer::taskEntry(void* arg) {
    static_cast<Buzzer*>(arg)->taskLoop();
}

void Buzzer::taskLoop() {
    TickType_t wake = xTaskGetTickCount();
    const TickType_t period = max((TickType_t)1, (TickType_t)pdMS_TO_TICKS(TICK_MS));
    for (;;) {
        vTaskDelayUntil(&wake, period);
        tick(millis());
    }
}
