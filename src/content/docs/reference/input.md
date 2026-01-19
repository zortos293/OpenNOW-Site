---
title: Input System
description: Cross-platform input handling in OpenNow Streamer
---

OpenNow Streamer implements a low-latency input system with mouse coalescing, local cursor rendering, and support for gamepads and racing wheels.

## Architecture

```
Raw Input (WM_INPUT / CGEvent / evdev)
       │
       ▼
┌─────────────────────┐
│   Platform Layer    │  windows.rs / macos.rs / linux.rs
└─────────────────────┘
       │
       ├── Local Cursor Update (immediate)
       │
       ▼
┌─────────────────────┐
│   Mouse Coalescer   │  2ms batching (500Hz)
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│   Input Handler     │  Event normalization
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│   Input Task        │  Async encoding
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│   WebRTC Channel    │  Network transmission
└─────────────────────┘
```

## Configuration Constants

```rust
/// Mouse event coalescing interval (2ms = 500Hz effective rate)
pub const MOUSE_COALESCE_INTERVAL_US: u64 = 2_000;

/// Maximum input queue depth before throttling
pub const MAX_INPUT_QUEUE_DEPTH: usize = 8;

/// Maximum clipboard paste size (64KB like official GFN)
pub const MAX_CLIPBOARD_PASTE_SIZE: usize = 65536;
```

## Input Events

```rust
pub enum InputEvent {
    KeyDown {
        keycode: u16,        // Windows Virtual Key code
        scancode: u16,       // Hardware scancode
        modifiers: u16,      // Shift/Ctrl/Alt/Super flags
        timestamp_us: u64,
    },
    KeyUp {
        keycode: u16,
        scancode: u16,
        modifiers: u16,
        timestamp_us: u64,
    },
    MouseMove {
        dx: i16,             // Relative X movement
        dy: i16,             // Relative Y movement
        timestamp_us: u64,
    },
    MouseButtonDown {
        button: u8,          // 1=Left, 2=Middle, 3=Right, 4=Back, 5=Forward
        timestamp_us: u64,
    },
    MouseButtonUp {
        button: u8,
        timestamp_us: u64,
    },
    MouseWheel {
        delta: i16,          // Scroll delta (positive = up)
        timestamp_us: u64,
    },
    Gamepad {
        controller_id: u8,
        buttons: u32,
        left_stick_x: i16,
        left_stick_y: i16,
        right_stick_x: i16,
        right_stick_y: i16,
        left_trigger: u8,
        right_trigger: u8,
        timestamp_us: u64,
    },
    ClipboardPaste {
        text: String,
    },
    Heartbeat,
}
```

## Mouse Coalescer

The `MouseCoalescer` batches high-frequency mouse events to reduce network overhead:

```rust
pub struct MouseCoalescer {
    accumulated_dx: AtomicI32,
    accumulated_dy: AtomicI32,
    last_send_us: AtomicU64,
    coalesce_interval_us: u64,  // Default: 2000 (2ms)
    coalesced_count: AtomicU64,
}
```

### Usage

```rust
// Accumulate delta, returns Some if ready to send
if let Some((dx, dy, timestamp_us)) = coalescer.accumulate(dx, dy) {
    send_event(InputEvent::MouseMove { dx, dy, timestamp_us });
}

// Force flush (before button events for proper ordering)
if let Some((dx, dy, timestamp_us)) = coalescer.flush() {
    send_event(InputEvent::MouseMove { dx, dy, timestamp_us });
}
```

### Benefits

- **Reduces bandwidth**: Instead of 1000+ events/sec, sends ~500 events/sec
- **Maintains responsiveness**: 2ms latency is imperceptible
- **Proper ordering**: Flush before button events ensures move→click sequence

## Local Cursor

The `LocalCursor` provides instant visual feedback independent of network latency:

```rust
pub struct LocalCursor {
    x: AtomicI32,
    y: AtomicI32,
    stream_width: AtomicI32,
    stream_height: AtomicI32,
    active: AtomicBool,
}
```

### Methods

| Method | Description |
|--------|-------------|
| `apply_delta(dx, dy)` | Update position with clamping |
| `position()` | Get (x, y) in screen coordinates |
| `position_normalized()` | Get (x, y) as 0.0-1.0 |
| `set_dimensions(w, h)` | Set stream bounds |
| `center()` | Move to center of stream |

The local cursor is updated immediately on raw input, then drawn over the video frame before the remote cursor position catches up.

## Input Handler

The `InputHandler` is the main interface for input processing:

```rust
pub struct InputHandler {
    event_tx: Mutex<Option<mpsc::Sender<InputEvent>>>,
    encoder: Mutex<InputEncoder>,
    cursor_captured: AtomicBool,
    pressed_keys: Mutex<HashSet<u16>>,
    mouse_coalescer: MouseCoalescer,
    local_cursor: LocalCursor,
    queue_depth: AtomicU64,
}
```

### Key Methods

| Method | Description |
|--------|-------------|
| `handle_mouse_button(button, state)` | Process mouse click (flushes pending movement first) |
| `handle_mouse_delta(dx, dy)` | Process relative mouse movement with coalescing |
| `handle_key(keycode, pressed, modifiers)` | Process keyboard event with key tracking |
| `handle_wheel(delta)` | Process scroll wheel |
| `handle_clipboard_paste()` | Read clipboard and send as key events |
| `release_all_keys()` | Release stuck keys on focus loss |
| `flush_mouse_events()` | Flush pending coalesced events |

### Key State Tracking

Keys are tracked to prevent duplicate events and enable proper release:

```rust
// On key down: only send if not already pressed
if pressed && !pressed_keys.insert(keycode) {
    return;  // Skip duplicate
}

// On focus loss: release all tracked keys
for keycode in pressed_keys.drain() {
    send_event(InputEvent::KeyUp { keycode, ... });
}
```

## Session Timing

Input timestamps are relative to session start for proper server-side processing:

```rust
/// Initialize at streaming start
pub fn init_session_timing();

/// Get timestamp (Unix base + relative offset)
pub fn get_timestamp_us() -> u64;

/// Get time since session start (for coalescing)
pub fn session_elapsed_us() -> u64;
```

## Modifier Flags

```rust
const SHIFT: u16 = 0x01;
const CTRL:  u16 = 0x02;
const ALT:   u16 = 0x04;
const SUPER: u16 = 0x08;  // Windows/Command key
```

## Gamepad Support

Gamepads are handled by `ControllerManager` using the gilrs library:

```rust
pub struct ControllerManager {
    gilrs: Gilrs,
    event_tx: Option<mpsc::Sender<InputEvent>>,
}
```

### Features

- **Automatic detection** of connected controllers
- **Rumble/vibration** support via `queue_rumble()`
- **Button mapping** to GFN format
- **Analog stick** deadzone handling

### Rumble

```rust
pub struct RumbleEffect {
    controller_id: u8,
    left_motor: u16,    // Low frequency
    right_motor: u16,   // High frequency
    duration_ms: u32,
}

controller_manager.queue_rumble(id, left, right, duration);
```

## Racing Wheel Support

Racing wheels are handled by `WheelManager` using Windows.Gaming.Input:

```rust
pub struct WheelManager {
    // Detects dedicated racing wheels (G29, G920, etc.)
    // Provides proper axis separation: wheel, throttle, brake, clutch
}
```

### Force Feedback

```rust
pub enum FfbEffectType {
    ConstantForce,
    Spring,
    Damper,
    Friction,
    // ...
}

wheel_manager.apply_force_feedback(wheel_id, effect_type, magnitude, duration);
```

### G29 HID Support

For Logitech G29 wheels in PS3 mode (not detected by Windows.Gaming.Input):

```rust
pub struct G29FfbManager {
    // Direct HID communication for force feedback
}

g29_ffb.apply_constant_force(magnitude);  // -1.0 to 1.0
```

## Platform-Specific Input

### Windows

- **WM_INPUT** for raw mouse input
- Bypasses mouse acceleration
- High-precision delta values

```rust
pub fn start_raw_input(hwnd: HWND);
pub fn get_raw_mouse_delta() -> (i32, i32);
pub fn update_raw_input_center(x: i32, y: i32);
```

### macOS

- **CGEvent** tap for raw input
- Requires accessibility permissions
- Supports high-DPI displays

### Linux

- **evdev** for raw input
- X11/Wayland support
- May require elevated permissions

## Input Channels

Mouse and keyboard/gamepad use different WebRTC channels:

| Input Type | Channel | Reliability | Purpose |
|------------|---------|-------------|---------|
| Keyboard | `input_channel_v1` | Reliable, ordered | No dropped keys |
| Gamepad | `input_channel_v1` | Reliable, ordered | Button/stick state |
| Mouse | `partially_reliable` | Unreliable, 8ms lifetime | Low latency |

## Clipboard Paste

Clipboard paste sends text as synthetic key events:

```rust
// Ctrl+V triggers clipboard paste
if InputHandler::is_paste_shortcut(keycode, modifiers) {
    input_handler.handle_clipboard_paste();
}

// Text is converted to Unicode key events
InputEvent::ClipboardPaste { text } → [KeyDown(char), KeyUp(char), ...]
```

Maximum paste size: 64KB (matches official GFN client).

## Queue Depth Management

Input events are throttled if the queue becomes too deep:

```rust
// Check queue depth before sending mouse events
let depth = self.queue_depth.load(Ordering::Acquire);
if depth > MAX_INPUT_QUEUE_DEPTH {
    // Still accumulate but may decimate
    self.mouse_coalescer.accumulate(dx, dy);
    return;
}
```

This prevents buffer bloat and maintains low latency under high input rates.
