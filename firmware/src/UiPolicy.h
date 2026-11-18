#pragma once
#include "InputManager.h"

// First-press policy for the OLED UI (pure function, unit-tested on the host).
//
//   display asleep       -> the press only wakes the display and shows the main menu
//   home/boot screen up  -> the press only dismisses it and shows the main menu
//   otherwise            -> normal navigation / selection
//
// Applies identically to UP, DOWN, SELECT (short) and SELECT_LONG.
enum PressAction : uint8_t {
    PRESS_NORMAL = 0,        // act on the event (navigate / select / long-press = back)
    PRESS_WAKE_TO_MENU,      // wake the display, show the main menu, do nothing else
    PRESS_DISMISS_HOME,      // display already on but showing the home screen: show the main menu
    PRESS_IGNORE             // wake event for a display that is already showing a menu
};

inline PressAction classifyNavEvent(ButtonEvent ev, bool displayAwake, bool homeVisible) {
    if (ev == BTN_WAKE || !displayAwake) {
        if (!displayAwake) return PRESS_WAKE_TO_MENU;
        return homeVisible ? PRESS_DISMISS_HOME : PRESS_IGNORE;
    }
    return homeVisible ? PRESS_DISMISS_HOME : PRESS_NORMAL;
}
