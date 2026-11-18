#include "Diag.h"

static esp_reset_reason_t g_resetReason = esp_reset_reason();   // captured before setup()

#define DIAG_MAGIC 0x55F7B05Au

struct DiagRtc {
    uint32_t magic;
    uint32_t boots;
    uint32_t lastReason;
    uint32_t crumbMs;
    char     crumb[48];
};
static RTC_NOINIT_ATTR DiagRtc g_rtc;

static void shutdownHook() {
    // Runs inside esp_restart(): marks the next boot as an intentional software restart.
    strncpy(g_rtc.crumb, "esp_restart() called (intentional software restart)", sizeof(g_rtc.crumb) - 1);
    g_rtc.crumb[sizeof(g_rtc.crumb) - 1] = 0;
}

namespace Diag {

esp_reset_reason_t resetReason() { return g_resetReason; }
uint32_t bootCount() { return g_rtc.boots; }

const char* resetReasonName(esp_reset_reason_t r) {
    switch (r) {
        case ESP_RST_POWERON:   return "POWERON (power applied)";
        case ESP_RST_EXT:       return "EXT (reset pin)";
        case ESP_RST_SW:        return "SW (esp_restart)";
        case ESP_RST_PANIC:     return "PANIC (crash / exception)";
        case ESP_RST_INT_WDT:   return "INT_WDT (interrupt watchdog)";
        case ESP_RST_TASK_WDT:  return "TASK_WDT (task watchdog)";
        case ESP_RST_WDT:       return "WDT (other watchdog)";
        case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
        case ESP_RST_BROWNOUT:  return "BROWNOUT (supply voltage dropped)";
        case ESP_RST_SDIO:      return "SDIO";
        default:                return "UNKNOWN";
    }
}

void begin() {
    bool valid = (g_rtc.magic == DIAG_MAGIC);
    char prevCrumb[sizeof(g_rtc.crumb)];
    uint32_t prevMs = 0;
    prevCrumb[0] = 0;

    if (valid) {
        strncpy(prevCrumb, g_rtc.crumb, sizeof(prevCrumb) - 1);
        prevCrumb[sizeof(prevCrumb) - 1] = 0;
        prevMs = g_rtc.crumbMs;
    } else {
        memset(&g_rtc, 0, sizeof(g_rtc));
        g_rtc.magic = DIAG_MAGIC;
    }
    g_rtc.boots++;
    g_rtc.lastReason = (uint32_t)g_resetReason;
    strncpy(g_rtc.crumb, "boot", sizeof(g_rtc.crumb) - 1);
    g_rtc.crumbMs = 0;

    esp_register_shutdown_handler(shutdownHook);

    Serial.println("---------------- BOOT DIAGNOSTICS ----------------");
    Serial.printf("Reset reason : %d = %s\n", (int)g_resetReason, resetReasonName(g_resetReason));
    Serial.printf("Boot count   : %lu (since last power-on)\n", (unsigned long)g_rtc.boots);
    if (valid && prevCrumb[0]) {
        Serial.printf("Last stage before this reset: \"%s\" (at %lu ms uptime)\n", prevCrumb, (unsigned long)prevMs);
    }
    if (g_resetReason == ESP_RST_BROWNOUT)  Serial.println("!! BROWNOUT: check supply/current (SIM800L, buzzer, OLED, camera).");
    if (g_resetReason == ESP_RST_PANIC)     Serial.println("!! PANIC: capture the 'Guru Meditation' text printed just before the reset.");
    if (g_resetReason == ESP_RST_TASK_WDT || g_resetReason == ESP_RST_INT_WDT || g_resetReason == ESP_RST_WDT)
        Serial.println("!! WATCHDOG reset: a task or interrupt was blocked too long.");
    Serial.printf("CPU %u MHz | flash %lu KB | PSRAM %lu KB\n",
                  (unsigned)getCpuFrequencyMhz(), (unsigned long)(ESP.getFlashChipSize() / 1024),
                  (unsigned long)(ESP.getPsramSize() / 1024));
    printHeap("boot");
    Serial.println("--------------------------------------------------");
}

void crumb(const char* where) {
    strncpy(g_rtc.crumb, where, sizeof(g_rtc.crumb) - 1);
    g_rtc.crumb[sizeof(g_rtc.crumb) - 1] = 0;
    g_rtc.crumbMs = millis();
}

void printHeap(const char* tag) {
    Serial.printf("[Heap:%s] free=%lu min=%lu maxBlock=%lu | PSRAM free=%lu\n", tag,
                  (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getMinFreeHeap(),
                  (unsigned long)ESP.getMaxAllocHeap(), (unsigned long)ESP.getFreePsram());
}

} // namespace Diag
