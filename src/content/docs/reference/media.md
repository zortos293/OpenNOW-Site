---
title: Media Pipeline
description: Video decoding, audio decoding, and rendering in OpenNow Streamer
---

OpenNow Streamer implements a high-performance media pipeline for video and audio processing with support for hardware acceleration and HDR.

## Pipeline Overview

```
RTP Packets (WebRTC)
       │
       ▼
┌─────────────────────┐
│  RTP Depacketizer   │  H.264/H.265 NAL assembly, AV1 OBU assembly
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  UnifiedVideoDecoder │  FFmpeg, GStreamer, or Native backends
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  SharedFrame        │  Zero-copy frame holder
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  GPU Renderer       │  wgpu + YUV→RGB shader
└─────────────────────┘
```

## RTP Depacketizer

The `RtpDepacketizer` handles codec-specific RTP depacketization:

```rust
pub enum DepacketizerCodec {
    H264,   // H.264 NAL unit assembly
    H265,   // H.265 NAL unit assembly
    AV1,    // AV1 OBU assembly
}

pub struct RtpDepacketizer {
    codec: DepacketizerCodec,
    // NAL accumulator for H.264/H.265
    // OBU accumulator for AV1
}
```

### Processing Flow

**H.264/H.265:**
```rust
// Process each RTP packet
let nal_units = depacketizer.process(&payload);

// Accumulate NAL units
for nal in nal_units {
    depacketizer.accumulate_nal(nal);
}

// On marker bit (end of frame), get complete Access Unit
if marker {
    let frame_data = depacketizer.take_nal_frame();
    decoder.decode_async(&frame_data, receive_time)?;
}
```

**AV1:**
```rust
// Process OBU data
depacketizer.process_av1_raw(&payload);

// On marker bit, flush pending OBU
if marker {
    depacketizer.flush_pending_obu();
    let frame_data = depacketizer.take_accumulated_frame();
    decoder.decode_async(&frame_data, receive_time)?;
}
```

## Video Frame

Decoded frames are stored in the `VideoFrame` struct:

```rust
pub struct VideoFrame {
    pub frame_id: u64,           // Unique ID for deduplication
    pub width: u32,
    pub height: u32,
    pub y_plane: Vec<u8>,        // Luma (full resolution)
    pub u_plane: Vec<u8>,        // Cb chroma
    pub v_plane: Vec<u8>,        // Cr chroma
    pub y_stride: u32,
    pub u_stride: u32,
    pub v_stride: u32,
    pub timestamp_us: u64,
    pub format: PixelFormat,
    pub color_range: ColorRange,
    pub color_space: ColorSpace,
    pub transfer_function: TransferFunction,
    // Platform-specific GPU frame for zero-copy
    pub gpu_frame: Option<Arc<PlatformGpuFrame>>,
}
```

## Pixel Formats

```rust
pub enum PixelFormat {
    YUV420P,  // Planar: Y, U, V separate planes
    NV12,     // Semi-planar: Y + interleaved UV
    P010,     // 10-bit HDR: 16-bit words, 10 bits used
}
```

| Format | Bit Depth | Chroma | Use Case |
|--------|-----------|--------|----------|
| YUV420P | 8-bit | 4:2:0 planar | Software decode (FFmpeg) |
| NV12 | 8-bit | 4:2:0 semi-planar | Hardware decode (DXVA, VideoToolbox) |
| P010 | 10-bit | 4:2:0 semi-planar | HDR content |

## Color Metadata

### Color Range

```rust
pub enum ColorRange {
    Limited,  // Y: 16-235, UV: 16-240 (TV/Video standard)
    Full,     // Y: 0-255, UV: 0-255 (PC/JPEG standard)
}
```

### Color Space

```rust
pub enum ColorSpace {
    BT709,   // HDTV (default)
    BT601,   // SDTV
    BT2020,  // UHDTV/HDR
}
```

### Transfer Function

```rust
pub enum TransferFunction {
    SDR,  // Gamma ~2.4 (BT.709/BT.601)
    PQ,   // HDR10 (SMPTE ST 2084)
    HLG,  // Hybrid Log-Gamma (ARIB STD-B67)
}
```

## Unified Video Decoder

The `UnifiedVideoDecoder` provides a common interface for all decoder backends:

```rust
pub struct UnifiedVideoDecoder {
    backend: DecoderBackend,
    shared_frame: Arc<SharedFrame>,
}

impl UnifiedVideoDecoder {
    pub fn new_async(
        codec: VideoCodec,
        backend: VideoDecoderBackend,
        shared_frame: Arc<SharedFrame>,
    ) -> Result<(Self, mpsc::Receiver<DecodeStats>)>;

    pub fn decode_async(
        &mut self,
        data: &[u8],
        receive_time: Instant,
    ) -> Result<()>;
}
```

### Decode Stats

```rust
pub struct DecodeStats {
    pub frame_produced: bool,
    pub decode_time_ms: f32,
    pub needs_keyframe: bool,
}
```

## Decoder Backends

### Backend Selection

```rust
pub enum VideoDecoderBackend {
    Auto,           // Auto-detect best decoder
    Cuvid,          // NVIDIA NVDEC
    Qsv,            // Intel QuickSync
    Vaapi,          // Linux VA-API
    Dxva,           // Windows D3D11 (GStreamer)
    NativeDxva,     // Windows Native D3D11 (HEVC only)
    VideoToolbox,   // macOS VideoToolbox
    VulkanVideo,    // GStreamer hardware (Linux)
    Software,       // CPU decoding
}
```

### Platform-Specific Backends

**Windows:**
| Backend | Technology | Codecs | Zero-Copy |
|---------|------------|--------|-----------|
| Dxva | GStreamer D3D11 | H.264, H.265 | Yes |
| NativeDxva | Native D3D11VA | H.265 only | Yes |
| Cuvid | NVDEC (GStreamer) | H.264, H.265 | Yes |
| Qsv | QuickSync (GStreamer) | H.264, H.265 | Yes |

**macOS:**
| Backend | Technology | Codecs | Zero-Copy |
|---------|------------|--------|-----------|
| VideoToolbox | FFmpeg + VT | H.264, H.265, AV1 | Yes (CVPixelBuffer) |

**Linux:**
| Backend | Technology | Codecs | Zero-Copy |
|---------|------------|--------|-----------|
| VulkanVideo | GStreamer VA/V4L2 | H.264, H.265 | Yes |
| Vaapi | GStreamer VA-API | H.264, H.265 | Yes |
| V4L2 | GStreamer V4L2 | H.264, H.265 | Yes (Raspberry Pi) |

### Auto Selection Logic

```rust
// Windows: GStreamer D3D11 → NativeDxva → FFmpeg
// macOS: FFmpeg + VideoToolbox
// Linux: GStreamer VA → GStreamer V4L2 → FFmpeg
// Raspberry Pi: GStreamer V4L2 (stateless)
```

## Audio Pipeline

### Audio Decoder

```rust
pub struct AudioDecoder {
    sample_rate: u32,  // 48000 Hz
    channels: u16,     // 2 (stereo)
    sample_tx: mpsc::Sender<Vec<f32>>,
}

impl AudioDecoder {
    pub fn new(sample_rate: u32, channels: u16) -> Result<Self>;
    pub fn decode_async(&mut self, rtp_data: &[u8]);
    pub fn take_sample_receiver(&mut self) -> Option<mpsc::Receiver<Vec<f32>>>;
}
```

### Audio Player

```rust
pub struct AudioPlayer {
    stream: cpal::Stream,
    buffer: Arc<Mutex<VecDeque<f32>>>,
}

impl AudioPlayer {
    pub fn new(sample_rate: u32, channels: u16) -> Result<Self>;
    pub fn push_samples(&self, samples: &[f32]);
    pub fn buffer_available(&self) -> usize;
}
```

Audio uses a jitter buffer (150ms) to handle network timing variations.

## Stream Statistics

```rust
pub struct StreamStats {
    pub resolution: String,
    pub fps: f32,                  // Decoded FPS
    pub render_fps: f32,           // Rendered FPS
    pub target_fps: u32,
    pub bitrate_mbps: f32,
    pub latency_ms: f32,           // Network latency
    pub decode_time_ms: f32,       // Per-frame decode time
    pub render_time_ms: f32,       // Per-frame render time
    pub input_latency_ms: f32,     // Input to transmission
    pub codec: String,
    pub gpu_type: String,
    pub frames_received: u64,
    pub frames_decoded: u64,
    pub frames_dropped: u64,
    pub frames_rendered: u64,
    pub rtt_ms: f32,               // Network RTT
    pub frame_delivery_ms: f32,    // RTP arrival to decode complete
    pub estimated_e2e_ms: f32,     // End-to-end latency estimate
    pub is_hdr: bool,
    pub color_space: String,
}
```

## Recording

OpenNow supports session recording to MP4:

```rust
pub fn recording_set_config(config: RecordingConfig);
pub fn recording_push_video_frame(frame: &VideoFrame);
pub fn recording_push_audio(samples: &[f32]);
pub fn recording_stop();
pub fn recording_is_active() -> bool;

pub enum RecordingCodec {
    H264,
    H265,
    // ...
}
```

## GPU Rendering

### wgpu Renderer

The renderer uses wgpu for cross-platform GPU acceleration:

1. **Upload YUV textures** to GPU (3 textures: Y, U, V)
2. **Run YUV→RGB shader** (WGSL compute or fragment shader)
3. **Composite egui overlay** (stats, sidebar)
4. **Present to swapchain**

### Color Conversion Shader

The shader handles different color spaces and ranges:

```wgsl
// BT.709 YUV to RGB conversion (limited range)
let y = (y_sample - 16.0/255.0) * (255.0/219.0);
let u = u_sample - 0.5;
let v = v_sample - 0.5;

let r = y + 1.5748 * v;
let g = y - 0.1873 * u - 0.4681 * v;
let b = y + 1.8556 * u;
```

### HDR Support

For HDR content (PQ transfer function):

1. Detect HDR from `transfer_function == PQ`
2. Use 10-bit P010 pixel format
3. Apply PQ EOTF (Perceptual Quantizer)
4. Tone map to display capabilities

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
├── Video decode (FFmpeg/Native/GStreamer)
└── SharedFrame updates

Audio Thread (dedicated)
├── Opus decode
└── cpal playback
```

The decoder runs on a dedicated thread to prevent blocking the main thread or Tokio runtime. Decoded frames are written to `SharedFrame` which is read by the renderer.
