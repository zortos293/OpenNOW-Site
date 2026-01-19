---
title: WebRTC
description: WebRTC peer connection, signaling, and data channels in OpenNow Streamer
---

OpenNow Streamer uses WebRTC for real-time video/audio streaming and bidirectional input. This document covers the signaling protocol, SDP negotiation, and data channel usage.

## Architecture Overview

```
┌─────────────────┐        WebSocket         ┌─────────────────┐
│   Signaling     │◄───────────────────────►│   GFN Server    │
│   (GfnSignaling)│    /nvst/sign_in         └─────────────────┘
└─────────────────┘                                   │
        │                                             │
        ▼                                             │
┌─────────────────┐        UDP/DTLS           ┌─────────────────┐
│   WebRTC Peer   │◄───────────────────────►│  Media Server   │
│   (WebRtcPeer)  │                          └─────────────────┘
└─────────────────┘
        │
        ├── Video Track (H.264/H.265/AV1)
        ├── Audio Track (Opus 48kHz stereo)
        └── Data Channels
            ├── input_channel_v1 (reliable)
            ├── partially_reliable (mouse)
            └── output_channel_v1 (rumble/FFB)
```

## Signaling

The `GfnSignaling` struct manages the WebSocket connection to the GFN server.

### Connection

```rust
pub struct GfnSignaling {
    server_host: String,
    session_id: String,
    event_tx: mpsc::Sender<SignalingEvent>,
}

// Connect to signaling server
signaling.connect().await?;
// URL: wss://{server_host}/nvst/sign_in?session_id={session_id}
```

### Signaling Events

```rust
pub enum SignalingEvent {
    SdpOffer(String),              // SDP offer from server
    IceCandidate(IceCandidate),    // Trickle ICE candidate
    Connected,                      // WebSocket connected
    Disconnected(String),           // WebSocket closed
    Error(String),                  // Error occurred
}
```

### ICE Candidate Structure

```rust
pub struct IceCandidate {
    pub candidate: String,
    pub sdp_mid: Option<String>,
    pub sdp_mline_index: Option<u32>,
}
```

## SDP Negotiation

GFN uses a custom SDP format called `nvstSdp` that includes streaming-specific parameters.

### SDP Processing Flow

1. **Receive SDP offer** from server via signaling
2. **Extract public IP** from hostname (e.g., `95-178-87-234.server.com` → `95.178.87.234`)
3. **Fix server IP** in SDP for proper ICE connectivity
4. **Inject provisional SSRCs** (2, 3, 4) for resolution change handling
5. **Prefer codec** based on user settings (H.264/H.265/AV1)
6. **Create SDP answer** via WebRTC peer
7. **Build nvstSdp** with streaming parameters
8. **Send answer** with both standard SDP and nvstSdp

### nvstSdp Parameters

The `build_nvst_sdp()` function generates streaming parameters:

```
v=0
o=SdpTest test_id_13 14 IN IPv4 127.0.0.1
s=-
t=0 0
a=general.icePassword:{ice_pwd}
a=general.iceUserNameFragment:{ice_ufrag}
a=general.dtlsFingerprint:{fingerprint}

m=video 0 RTP/AVP
a=msid:fbc-video-0

# FEC (Forward Error Correction)
a=vqos.fec.rateDropWindow:10
a=vqos.fec.minRequiredFecPackets:2
a=vqos.fec.repairMinPercent:5
a=vqos.fec.repairPercent:5
a=vqos.fec.repairMaxPercent:35

# DRC/DFC (Dynamic Rate/Frame Control)
a=vqos.drc.enable:0
a=vqos.dfc.enable:1  # For 120+ FPS
a=vqos.dfc.decodeFpsAdjPercent:85

# Video Quality
a=video.clientViewportWd:{width}
a=video.clientViewportHt:{height}
a=video.maxFPS:{fps}
a=video.initialBitrateKbps:{max_bitrate * 3/4}
a=vqos.bw.maximumBitrateKbps:{max_bitrate}
a=vqos.bw.peakBitrateKbps:{max_bitrate}

# Resolution Control (disabled to prevent SSRC changes)
a=vqos.resControl.cpmRtc.enable:0
a=vqos.resControl.cpmRtc.featureMask:0
a=vqos.resControl.cpmRtc.minResolutionPercent:100

m=audio 0 RTP/AVP
a=msid:audio

m=mic 0 RTP/AVP
a=msid:mic

m=application 0 RTP/AVP
a=msid:input_1
a=ri.partialReliableThresholdMs:300
```

### High FPS Optimizations (120+ FPS)

Additional parameters for high frame rate streaming:

```
a=bwe.iirFilterFactor:8
a=video.encoderFeatureSetting:47
a=video.encoderPreset:6
a=vqos.dfc.minTargetFps:{100 for 120fps, 60 for 240fps}
a=video.fbcDynamicFpsGrabTimeoutMs:{6 for 120fps, 18 for 240fps}
```

### 240+ FPS Optimizations

```
a=video.enableNextCaptureMode:1
a=vqos.maxStreamFpsEstimate:240
a=video.videoSplitEncodeStripsPerFrame:3
a=video.updateSplitEncodeStateDynamically:1
```

## WebRTC Peer

The `WebRtcPeer` struct manages the WebRTC connection.

### Events

```rust
pub enum WebRtcEvent {
    Connected,
    Disconnected,
    VideoFrame { payload: Vec<u8>, rtp_timestamp: u32, marker: bool },
    AudioFrame(Vec<u8>),
    DataChannelOpen(String),
    DataChannelMessage(String, Vec<u8>),
    IceCandidate(String, Option<String>, Option<u16>),
    Error(String),
    SsrcChangeDetected { stall_duration_ms: u64 },
}
```

### ICE Servers

ICE servers are configured from the CloudMatch session response plus fallbacks:

```rust
// From session.ice_servers
RTCIceServer { urls: session_ice_urls, username, credential }

// Fallback STUN servers
RTCIceServer { urls: ["stun:s1.stun.gamestream.nvidia.com:19308"] }
RTCIceServer { urls: ["stun:stun.l.google.com:19302", 
                      "stun:stun1.l.google.com:19302"] }
```

## Data Channels

### Input Channels

| Channel | Type | Purpose |
|---------|------|---------|
| `input_channel_v1` | Reliable, ordered | Keyboard, gamepad |
| `partially_reliable` | Unreliable, unordered | Mouse (8ms lifetime) |

### Output Channels

| Channel | Type | Purpose |
|---------|------|---------|
| `output_channel_v1` | Reliable | Rumble, force feedback |

### Input Protocol

The input handshake uses a version negotiation:

```
Server sends: [0x0E, 0x02, version_lo, version_hi]  (new format)
           or: [0x0E, version_lo, version_hi]       (old format)

Client echoes the same bytes back

After handshake, input_ready = true
```

### Input Encoding

```rust
pub struct InputEncoder {
    protocol_version: u8,
    sequence: u32,
}

impl InputEncoder {
    pub fn encode(&mut self, event: &InputEvent) -> Vec<u8>;
}
```

Input events are encoded to binary format with timestamps for proper server-side processing.

## Streaming Result

The streaming session returns a result indicating how it ended:

```rust
pub enum StreamingResult {
    Normal,                              // Clean shutdown
    Error(String),                       // Connection error
    SsrcChangeDetected { stall_duration_ms: u64 },  // Resolution change
}
```

### SSRC Change Handling

GFN servers may change video SSRC when resolution changes. Since webrtc-rs doesn't support mid-stream SSRC changes without MID extensions, OpenNow detects this as a stall and initiates reconnection:

1. Video frames stop arriving
2. After timeout, `SsrcChangeDetected` event is raised
3. Application triggers session reconnect
4. Provisional SSRCs (2, 3, 4) are injected in SDP to help with future changes

## Network Stats

```rust
pub struct NetworkStats {
    pub rtt_ms: f32,  // Round-trip time from ICE candidate pair
}

// Get stats from peer
let stats = peer.get_network_stats().await;
```

## Keyframe Requests

When the decoder needs a keyframe (corruption, packet loss), it can request one:

```rust
pub async fn request_keyframe();
```

This sends a RTCP PLI (Picture Loss Indication) to the server.
