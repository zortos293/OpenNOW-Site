---
title: Architecture Overview
description: High-level architecture of OpenNow Streamer
---

OpenNow Streamer is organized into several modules that handle different aspects of the streaming client. This document provides an overview of the architecture and how components interact.

## Module Structure

```
src/
├── main.rs          # Application entry point and event loop
├── lib.rs           # Library exports
├── api/             # GFN API clients (CloudMatch, Games, Queue)
├── app/             # Application state and session management
├── auth/            # OAuth authentication and token management
├── gui/             # UI rendering with egui
├── input/           # Cross-platform input handling
├── media/           # Video/audio decoding and rendering
├── utils/           # Logging and time utilities
└── webrtc/          # WebRTC peer connection and signaling
```

## Core Components

### Application Layer (`app/`)

The `App` struct is the central state machine that coordinates all components:

```rust
pub struct App {
    pub state: AppState,           // Login, Games, Session, Streaming
    pub settings: Settings,        // User configuration
    pub auth_tokens: Option<AuthTokens>,
    pub session: Option<SessionInfo>,
    pub streaming_session: Option<Arc<Mutex<StreamingSession>>>,
    pub input_handler: Option<Arc<InputHandler>>,
    pub shared_frame: Option<Arc<SharedFrame>>,
    pub stats: StreamStats,
    // ... UI state fields
}
```

**Application States:**
- `Login` - User not authenticated
- `Games` - Browsing game library
- `Session` - Creating/polling a streaming session
- `Streaming` - Active video/audio stream

### Authentication (`auth/`)

Handles OAuth 2.0 with PKCE flow:

1. Generate PKCE verifier and challenge
2. Open browser to `login.nvidia.com/authorize`
3. Start local callback server on port 2259/6460/7119/8870/9096
4. Exchange authorization code for tokens
5. Support token refresh before expiration

**Alliance Partners**: Supports multiple login providers via the `/v1/serviceUrls` API, enabling regional partners like au by KDDI, Taiwan Mobile, and bro.game.

### API Layer (`api/`)

HTTP clients for GFN services:

| Module | Purpose |
|--------|---------|
| `cloudmatch.rs` | Session creation, polling, termination |
| `games.rs` | Game library via GraphQL API |
| `queue.rs` | Queue time estimates (PrintedWaste API) |
| `error_codes.rs` | Session error code mapping |

**Key Endpoints:**
- `https://login.nvidia.com/` - OAuth authentication
- `https://prod.cloudmatchbeta.nvidiagrid.net/v2/session` - Session management
- `https://games.geforce.com/graphql` - Game library

### WebRTC Layer (`webrtc/`)

Manages the streaming connection:

```
┌─────────────┐     WebSocket      ┌─────────────┐
│  Signaling  │◄──────────────────►│  GFN Server │
└─────────────┘                    └─────────────┘
       │                                  │
       ▼                                  │
┌─────────────┐     UDP/DTLS       ┌─────────────┐
│  WebRTC     │◄──────────────────►│  Media      │
│  Peer       │                    │  Server     │
└─────────────┘                    └─────────────┘
       │
       ├── Video Track (H.264/H.265/AV1)
       ├── Audio Track (Opus)
       └── Data Channels (Input, Cursor, Control)
```

**Key Components:**
- `signaling.rs` - WebSocket connection to `/nvst/sign_in`
- `peer.rs` - WebRTC peer connection management
- `sdp.rs` - SDP manipulation and nvstSdp generation
- `datachannel.rs` - Input encoding and output decoding

### Media Pipeline (`media/`)

Video and audio processing:

```
RTP Packets
    │
    ▼
┌─────────────────┐
│ RTP Depacketizer │  (H.264/H.265/AV1 NAL assembly)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Video Decoder   │  (FFmpeg, DXVA, VideoToolbox, VAAPI)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ SharedFrame     │  (Zero-copy frame holder)
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ GPU Renderer    │  (wgpu + YUV->RGB shader)
└─────────────────┘
```

**Decoder Backends:**
- **FFmpeg** - Universal software/hardware decoding
- **Native DXVA** - Windows hardware decoding (D3D11VA)
- **VideoToolbox** - macOS hardware decoding
- **VAAPI** - Linux AMD/Intel hardware decoding
- **GStreamer** - Linux V4L2 (Raspberry Pi) and Windows D3D11

### Input System (`input/`)

Cross-platform input with low-latency optimizations:

```rust
pub struct InputHandler {
    event_tx: Mutex<Option<mpsc::Sender<InputEvent>>>,
    mouse_coalescer: MouseCoalescer,   // 2ms batching
    local_cursor: LocalCursor,          // Instant visual feedback
    pressed_keys: Mutex<HashSet<u16>>,  // Key state tracking
}
```

**Features:**
- Mouse coalescing (2ms interval, 500Hz effective rate)
- Local cursor rendering (instant feedback)
- Raw input on Windows/macOS (bypasses OS acceleration)
- Gamepad support via gilrs
- Racing wheel support via Windows.Gaming.Input
- Force feedback / rumble handling

### GUI Layer (`gui/`)

Built with egui for immediate-mode UI:

- **Login Screen** - Provider selection, OAuth button
- **Games Screen** - Library browser with search
- **Session Screen** - Queue status, connection progress
- **Streaming Overlay** - Stats panel, sidebar controls

**Renderer:**
- wgpu backend (DX12/Metal/Vulkan)
- YUV to RGB conversion via WGSL shaders
- Supports exclusive fullscreen (Windows)
- ProMotion 120Hz support (macOS)

## Data Flow

### Session Startup

```
1. User selects game
2. POST /v2/session (CloudMatch API)
3. Poll session status until ready
4. Connect WebSocket signaling
5. Receive SDP offer
6. Create WebRTC peer connection
7. Generate SDP answer with nvstSdp
8. ICE candidate exchange
9. DTLS handshake
10. Data channel handshake (input ready)
11. Begin receiving video/audio
```

### Frame Processing

```
1. RTP packet received via WebRTC
2. Depacketize to NAL units (H.264/H.265) or OBUs (AV1)
3. Accumulate until marker bit (complete frame)
4. Submit to async decoder thread
5. Decoder writes to SharedFrame
6. Renderer reads SharedFrame
7. Upload YUV textures to GPU
8. Run YUV->RGB shader
9. Composite egui overlay
10. Present to display
```

### Input Processing

```
1. Raw input event (Windows WM_INPUT / macOS CGEvent)
2. Update local cursor position (immediate)
3. Accumulate in MouseCoalescer (2ms batches)
4. Flush to InputEvent channel
5. Input task encodes to binary format
6. Send via data channel:
   - Mouse → partially_reliable (8ms lifetime)
   - Keyboard → input_channel_v1 (reliable)
   - Gamepad → input_channel_v1 (reliable)
```

## Threading Model

```
Main Thread (winit event loop)
├── GUI rendering (egui)
├── Window events
└── State updates

Tokio Runtime (multi-threaded)
├── Signaling WebSocket
├── WebRTC peer events
├── API requests
└── Input event processing

Decoder Thread (dedicated)
├── Video decode (FFmpeg/Native)
└── SharedFrame updates

Audio Thread (dedicated)
├── Opus decode
└── cpal playback
```
