#pragma once
#include <Arduino.h>
#include <atomic>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include "ResourceManager.h"

// Events delivered to the UI (main loop) through a FreeRTOS queue.
//   BTN_UP / BTN_DOWN : once per physical press (no auto-repeat)
//   BTN_SELECT        : short press, delivered on RELEASE (press shorter than the long threshold)
//   BTN_SELECT_LONG   : delivered once when SELECT has been held >= 1200 ms
//                       (that same physical press never also produces BTN_SELECT)
//   BTN_WAKE          : a navigation press that arrived while the display was asleep.
//                       It REPLACES the normal event: the first press only wakes the OLED.
//   BTN_EMERGENCY     : emergency button held continuously for 3 s (once per hold; release re-arms)
enum ButtonEvent : uint8_t {
    BTN_NONE = 0,
    BTN_UP,
    BTN_DOWN,
    BTN_SELECT,
    BTN_SELECT_LONG,
    BTN_WAKE,
    BTN_EMERGENCY
};

struct InputStats {
    uint32_t polls;
    uint32_t readFailures;
    uint32_t upCount;
    uint32_t downCount;
    uint32_t selectShort;
    uint32_t selectLong;
    uint32_t wakeCount;
    uint32_t emergencyCount;
    uint32_t queueDrops;
    uint32_t maxPollGapMs;
    uint8_t  lastRaw;            // last GPIOA value read (bit=0 -> pressed for GPA0-3)
    bool     healthy;            // false while the MCP23017 cannot be read
    uint32_t stackFreeBytes;
};

class InputManager {
public:
    InputManager(ResourceManager& rm);

    // Validates that the MCP23017 is usable (configuration itself is done in ResourceManager::begin()).
    bool begin();

    // Creates the polling task. Events go to `queue` (items of type ButtonEvent).
    bool startTask(QueueHandle_t queue, UBaseType_t priority = 3, BaseType_t core = 0);

    // The UI tells the input task whether the OLED is awake (decides wake-vs-action at press time).
    void setDisplayAwake(bool awake);

    // Boot-time check: true only if SELECT is read LOW continuously for holdMs.
    // Read errors count as "not pressed". Returns immediately when SELECT is not pressed.
    bool bootSelectHeld(uint32_t holdMs);

    InputStats getStats();

#ifdef UFTB_HOST_TEST
public:   // host-side unit tests drive processSample() with a simulated clock
#else
private:
#endif
    struct Btn {
        bool     stable   = false;   // debounced state (true = pressed)
        uint8_t  count    = 0;       // consecutive samples differing from `stable`
        bool     suppress = false;   // pressed while (re)syncing: ignore until released
        bool     wakeOnly = false;   // this press only woke the display
        bool     fired    = false;   // long/emergency already fired for this press
        uint32_t pressedAt = 0;
    };

    ResourceManager& resMgr;
    bool mcpConnected;

    Btn btn[4];                      // 0 emergency, 1 up, 2 down, 3 select
    QueueHandle_t queue;
    TaskHandle_t taskHandle;
    std::atomic<bool> displayAwake;
    bool emergencyUnsent;

    InputStats stats;
    uint32_t failStreak;
    bool resync;                     // next valid sample only adopts the physical state (no events)

    static void taskEntry(void* arg);
    void taskLoop();
    void processSample(bool readOk, uint8_t raw, uint32_t now);   // one poll's worth of logic (host-testable)
    void update(int idx, bool pressedNow, uint32_t now);
    void onEdge(int idx, bool pressed, uint32_t now);
    void onHold(int idx, uint32_t now);
    void emit(ButtonEvent ev);
    void flushEmergency();
};
