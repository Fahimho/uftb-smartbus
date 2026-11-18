#include "InputManager.h"

// ---- timing (ms) ----
static const uint32_t POLL_MS            = 5;      // one I2C read of GPIOA per poll for all 4 buttons
static const uint8_t  DEBOUNCE_SAMPLES   = 5;      // 5 x 5 ms = 25 ms stable before a change is accepted
static const uint32_t SELECT_LONG_MS     = 700;
static const uint32_t EMERGENCY_HOLD_MS  = 3000;
static const uint32_t VERIFY_PERIOD_MS   = 2000;   // re-check MCP23017 configuration
static const uint32_t FAIL_UNHEALTHY     = 100;    // consecutive failed polls (~0.5 s) -> unhealthy

enum { IDX_EMERGENCY = 0, IDX_UP = 1, IDX_DOWN = 2, IDX_SELECT = 3 };

InputManager::InputManager(ResourceManager& rm)
    : resMgr(rm), mcpConnected(false), queue(nullptr), taskHandle(nullptr),
      displayAwake(true), emergencyUnsent(false), failStreak(0), resync(true) {
    memset(&stats, 0, sizeof(stats));
    stats.healthy = true;
}

bool InputManager::begin() {
    Serial.println("[InputManager] Checking MCP23017...");

    if (!resMgr.isMcpConnected()) {
        Serial.println("[ERROR] MCP23017 not initialized by ResourceManager!");
        mcpConnected = false;
        return false;
    }

    mcpConnected = true;

    // Make sure the chip is configured as expected (also self-heals if it was left half-configured).
    if (!resMgr.verifyMcpConfig()) {
        Serial.println("[WARN] MCP23017 verify failed at boot (input task will keep retrying).");
    }

    uint8_t raw = 0;
    if (resMgr.readButtons(raw)) {
        Serial.printf("[InputManager] GPIOA = 0x%02X (bits0-3: 1 = released)\n", raw);
    }

    Serial.println("[OK] InputManager configured.");
    return true;
}

void InputManager::setDisplayAwake(bool awake) {
    displayAwake.store(awake);
}

bool InputManager::bootSelectHeld(uint32_t holdMs) {
    if (!mcpConnected) return false;
    uint8_t raw = 0xFF;
    if (!resMgr.readButtons(raw) || (raw & (1 << MCP_PIN_SELECT))) return false;

    uint32_t start = millis();
    while (millis() - start < holdMs) {
        delay(20);
        if (!resMgr.readButtons(raw) || (raw & (1 << MCP_PIN_SELECT))) return false;
    }
    return true;
}

bool InputManager::startTask(QueueHandle_t q, UBaseType_t priority, BaseType_t core) {
    if (!mcpConnected || q == nullptr || taskHandle != nullptr) return false;
    queue = q;
    BaseType_t ok = xTaskCreatePinnedToCore(taskEntry, "InputTask", 4096, this, priority, &taskHandle, core);
    if (ok != pdPASS) {
        taskHandle = nullptr;
        Serial.println("[ERROR] Failed to create InputTask!");
        return false;
    }
    Serial.printf("[Task] InputTask started on Core %d (poll %lu ms, debounce %lu ms)\n",
                  (int)core, (unsigned long)POLL_MS, (unsigned long)(POLL_MS * DEBOUNCE_SAMPLES));
    return true;
}

InputStats InputManager::getStats() {
    InputStats s = stats;
    s.stackFreeBytes = taskHandle ? (uint32_t)uxTaskGetStackHighWaterMark(taskHandle) * sizeof(StackType_t) : 0;
    return s;
}

// --------------------------------------------------
// TASK
// --------------------------------------------------

void InputManager::taskEntry(void* arg) {
    static_cast<InputManager*>(arg)->taskLoop();
}

void InputManager::emit(ButtonEvent ev) {
    if (queue == nullptr) return;
    if (xQueueSend(queue, &ev, 0) != pdTRUE) {
        stats.queueDrops++;
    }
}

// The emergency event must not be lost when the queue is momentarily full: it is retried every poll.
void InputManager::flushEmergency() {
    if (emergencyUnsent && queue != nullptr) {
        ButtonEvent ev = BTN_EMERGENCY;
        if (xQueueSend(queue, &ev, 0) == pdTRUE) {
            emergencyUnsent = false;
        }
    }
}

void InputManager::onEdge(int idx, bool pressed, uint32_t now) {
    Btn& b = btn[idx];

    if (pressed) {
        b.pressedAt = now;
        b.fired = false;
        b.wakeOnly = false;

        if (idx == IDX_UP || idx == IDX_DOWN || idx == IDX_SELECT) {
            if (!displayAwake.load()) {
                // First press while the OLED sleeps: wake only, never act.
                b.wakeOnly = true;
                stats.wakeCount++;
                emit(BTN_WAKE);
            } else if (idx == IDX_UP) {
                stats.upCount++;
                emit(BTN_UP);
            } else if (idx == IDX_DOWN) {
                stats.downCount++;
                emit(BTN_DOWN);
            }
            // SELECT: decided on release (short) or by hold time (long)
        }
        return;
    }

    // ---- released ----
    if (b.suppress) {
        b.suppress = false;
        b.wakeOnly = false;
        b.fired = false;
        return;
    }

    if (idx == IDX_SELECT && !b.wakeOnly && !b.fired) {
        stats.selectShort++;
        emit(BTN_SELECT);
    }
    b.wakeOnly = false;
    b.fired = false;    // emergency: release re-arms
}

void InputManager::onHold(int idx, uint32_t now) {
    Btn& b = btn[idx];
    if (b.suppress || b.fired || b.wakeOnly) return;

    if (idx == IDX_SELECT && (now - b.pressedAt) >= SELECT_LONG_MS) {
        b.fired = true;
        stats.selectLong++;
        emit(BTN_SELECT_LONG);
    } else if (idx == IDX_EMERGENCY && (now - b.pressedAt) >= EMERGENCY_HOLD_MS) {
        b.fired = true;
        stats.emergencyCount++;
        emergencyUnsent = true;
        flushEmergency();
    }
}

void InputManager::update(int idx, bool pressedNow, uint32_t now) {
    Btn& b = btn[idx];

    if (pressedNow != b.stable) {
        if (++b.count >= DEBOUNCE_SAMPLES) {
            b.count = 0;
            b.stable = pressedNow;
            onEdge(idx, pressedNow, now);
        }
    } else {
        b.count = 0;
    }

    if (b.stable) {
        onHold(idx, now);
    }
}

void InputManager::processSample(bool readOk, uint8_t raw, uint32_t now) {
    stats.polls++;
    flushEmergency();

    if (!readOk) {
        // A failed read is NOT "released": keep the current debounced state, count the failure.
        stats.readFailures++;
        failStreak++;
        if (failStreak == FAIL_UNHEALTHY) {
            stats.healthy = false;
            resync = true;
            Serial.println("[Input] MCP23017 unreadable for ~0.5 s -> input marked unhealthy");
        }
        if (failStreak >= FAIL_UNHEALTHY && (failStreak % FAIL_UNHEALTHY) == 0) {
            resMgr.verifyMcpConfig();
        }
        return;
    }

    if (failStreak >= FAIL_UNHEALTHY) {
        Serial.printf("[Input] MCP23017 readable again after %lu failed polls\n", (unsigned long)failStreak);
    }
    failStreak = 0;
    stats.healthy = true;
    stats.lastRaw = raw;

    if (resync) {
        // Adopt the current physical state without generating events.
        // A button already held stays suppressed until it is released.
        for (int i = 0; i < 4; i++) {
            bool pressed = (raw & (1 << i)) == 0;
            btn[i].stable = pressed;
            btn[i].count = 0;
            btn[i].suppress = pressed;
            btn[i].wakeOnly = false;
            btn[i].fired = false;
        }
        resync = false;
    } else {
        for (int i = 0; i < 4; i++) {
            update(i, (raw & (1 << i)) == 0, now);
        }
    }
}

void InputManager::taskLoop() {
    TickType_t wakeTick = xTaskGetTickCount();
    const TickType_t period = max((TickType_t)1, (TickType_t)pdMS_TO_TICKS(POLL_MS));

    uint32_t lastPoll = millis();
    uint32_t lastVerify = millis();

    for (;;) {
        vTaskDelayUntil(&wakeTick, period);

        uint32_t now = millis();
        uint32_t gap = now - lastPoll;
        lastPoll = now;
        if (gap > stats.maxPollGapMs) stats.maxPollGapMs = gap;

        uint8_t raw = 0xFF;
        bool ok = resMgr.readButtons(raw);
        processSample(ok, raw, now);

        if (ok && now - lastVerify >= VERIFY_PERIOD_MS) {
            lastVerify = now;
            resMgr.verifyMcpConfig();
        }
    }
}
