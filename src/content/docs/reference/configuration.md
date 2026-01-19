---
title: Configuration
description: Settings and configuration options in OpenNow Streamer
---

OpenNow Streamer stores user settings in a JSON file. This document covers all available configuration options.

## Settings File Location

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\opennow-streamer\settings.json` |
| macOS | `~/Library/Application Support/opennow-streamer/settings.json` |
| Linux | `~/.config/opennow-streamer/settings.json` |

## Settings Structure

```rust
pub struct Settings {
    // Video
    pub quality: StreamQuality,
    pub resolution: String,
    pub fps: u32,
    pub codec: VideoCodec,
    pub max_bitrate_mbps: u32,
    pub decoder_backend: VideoDecoderBackend,
    pub color_quality: ColorQuality,
    pub hdr_enabled: bool,

    // Audio
    pub audio_codec: AudioCodec,
    pub surround: bool,

    // Performance
    pub vsync: bool,
    pub low_latency_mode: bool,
    pub nvidia_reflex: bool,

    // Input
    pub mouse_sensitivity: f32,
    pub raw_input: bool,
    pub clipboard_paste_enabled: bool,

    // Display
    pub fullscreen: bool,
    pub borderless: bool,
    pub window_width: u32,
    pub window_height: u32,
    pub show_stats: bool,
    pub stats_position: StatsPosition,

    // Game
    pub game_language: GameLanguage,

    // Network
    pub preferred_region: Option<String>,
    pub selected_server: Option<String>,
    pub auto_server_selection: bool,
    pub proxy: Option<String>,
    pub disable_telemetry: bool,
}
```

## Video Settings

### Stream Quality Presets

```rust
pub enum StreamQuality {
    Auto,         // 1080p 60fps (auto-detect)
    Low,          // 720p 30fps
    Medium,       // 1080p 60fps
    High,         // 1440p 60fps
    Ultra,        // 4K 60fps
    High120,      // 1080p 120fps
    Ultra120,     // 1440p 120fps
    Competitive,  // 1080p 240fps
    Extreme,      // 1080p 360fps
    Custom,       // Use manual resolution/fps
}
```

### Resolution Options

| Resolution | Name |
|------------|------|
| `1280x720` | 720p |
| `1920x1080` | 1080p |
| `2560x1440` | 1440p |
| `3840x2160` | 4K |
| `2560x1080` | Ultrawide 1080p |
| `3440x1440` | Ultrawide 1440p |
| `5120x1440` | Super Ultrawide |

### FPS Options

```rust
pub const FPS_OPTIONS: &[u32] = &[30, 60, 90, 120, 144, 165, 240, 360];
```

### Video Codec

```rust
pub enum VideoCodec {
    H264,  // Wide compatibility
    H265,  // Better compression (default)
    AV1,   // Best compression, modern GPUs
}
```

| Codec | Compression | Compatibility | HDR |
|-------|-------------|---------------|-----|
| H.264 | Good | All GPUs | No |
| H.265 | Better | Most GPUs | Yes |
| AV1 | Best | RTX 40+, RX 7000+ | Yes |

### Decoder Backend

```rust
pub enum VideoDecoderBackend {
    Auto,          // Auto-select best
    Cuvid,         // NVIDIA NVDEC
    Qsv,           // Intel QuickSync
    Vaapi,         // Linux VA-API
    Dxva,          // Windows D3D11 (GStreamer)
    NativeDxva,    // Windows D3D11 Native (H.265 only)
    VideoToolbox,  // macOS VideoToolbox
    VulkanVideo,   // GStreamer hardware
    Software,      // CPU decoding
}
```

**Recommended per platform:**
- **Windows**: `Dxva` (D3D11 GStreamer) or `Auto`
- **macOS**: `VideoToolbox` or `Auto`
- **Linux**: `VulkanVideo` (GStreamer) or `Vaapi`
- **Raspberry Pi**: Auto-selects V4L2

### Color Quality

```rust
pub enum ColorQuality {
    Bit8Yuv420,   // 8-bit, YUV 4:2:0 - Most compatible
    Bit8Yuv444,   // 8-bit, YUV 4:4:4 - Better color (needs H.265)
    Bit10Yuv420,  // 10-bit, YUV 4:2:0 - HDR ready (default)
    Bit10Yuv444,  // 10-bit, YUV 4:4:4 - Best quality (needs H.265)
}
```

| Setting | Bit Depth | Chroma | Bandwidth | Requires |
|---------|-----------|--------|-----------|----------|
| `Bit8Yuv420` | 8 | 4:2:0 | Low | Any codec |
| `Bit8Yuv444` | 8 | 4:4:4 | Medium | H.265 |
| `Bit10Yuv420` | 10 | 4:2:0 | Medium | H.265 |
| `Bit10Yuv444` | 10 | 4:4:4 | High | H.265 |

### Bitrate

`max_bitrate_mbps` controls the maximum stream bitrate:

| Value | Meaning |
|-------|---------|
| 50 | 50 Mbps (good for most connections) |
| 100 | 100 Mbps (fast connections) |
| 150 | 150 Mbps (default, very fast connections) |
| 200 | Unlimited (server decides) |

## Audio Settings

### Audio Codec

```rust
pub enum AudioCodec {
    Opus,        // Standard Opus (default)
    OpusStereo,  // Opus with explicit stereo
}
```

Audio is always 48kHz stereo.

### Surround Sound

`surround: bool` - Enable 5.1/7.1 surround output (if supported by game).

## Performance Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `vsync` | `false` | Enable VSync (may add latency) |
| `low_latency_mode` | `true` | Reduce buffer sizes |
| `nvidia_reflex` | `true` | Enable NVIDIA Reflex (auto for 120+ FPS) |

## Input Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `mouse_sensitivity` | `1.0` | Mouse sensitivity multiplier |
| `raw_input` | `true` | Use raw input (bypasses OS acceleration) |
| `clipboard_paste_enabled` | `true` | Allow Ctrl+V clipboard paste |

## Display Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `fullscreen` | `false` | Start in fullscreen |
| `borderless` | `true` | Use borderless fullscreen |
| `window_width` | `0` | Window width (0 = default) |
| `window_height` | `0` | Window height (0 = default) |
| `show_stats` | `true` | Show statistics panel |
| `stats_position` | `BottomLeft` | Stats panel position |

### Stats Position

```rust
pub enum StatsPosition {
    TopLeft,
    TopRight,
    BottomLeft,   // Default
    BottomRight,
}
```

## Game Settings

### Game Language

Controls in-game language (menus, subtitles, audio):

```rust
pub enum GameLanguage {
    EnglishUS,    // en_US (default)
    EnglishGB,    // en_GB
    German,       // de_DE
    French,       // fr_FR
    Spanish,      // es_ES
    SpanishMX,    // es_MX
    Italian,      // it_IT
    Portuguese,   // pt_PT
    PortugueseBR, // pt_BR
    Russian,      // ru_RU
    Polish,       // pl_PL
    Turkish,      // tr_TR
    Arabic,       // ar_SA
    Japanese,     // ja_JP
    Korean,       // ko_KR
    ChineseSimplified,   // zh_CN
    ChineseTraditional,  // zh_TW
    Thai,         // th_TH
    Vietnamese,   // vi_VN
    Indonesian,   // id_ID
    Czech,        // cs_CZ
    Greek,        // el_GR
    Hungarian,    // hu_HU
    Romanian,     // ro_RO
    Ukrainian,    // uk_UA
    Dutch,        // nl_NL
    Swedish,      // sv_SE
    Danish,       // da_DK
    Finnish,      // fi_FI
    Norwegian,    // nb_NO
}
```

## Network Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `preferred_region` | `None` | Preferred server region |
| `selected_server` | `None` | Specific server zone ID |
| `auto_server_selection` | `true` | Auto-select best ping server |
| `proxy` | `None` | Proxy URL for connections |
| `disable_telemetry` | `true` | Disable NVIDIA telemetry |

## Default Settings

```rust
impl Default for Settings {
    fn default() -> Self {
        Self {
            quality: StreamQuality::Auto,
            resolution: "1920x1080".to_string(),
            fps: 60,
            codec: VideoCodec::H264,
            max_bitrate_mbps: 150,
            decoder_backend: VideoDecoderBackend::Auto,
            color_quality: ColorQuality::Bit10Yuv420,
            hdr_enabled: false,
            audio_codec: AudioCodec::Opus,
            surround: false,
            vsync: false,
            low_latency_mode: true,
            nvidia_reflex: true,
            mouse_sensitivity: 1.0,
            raw_input: true,
            clipboard_paste_enabled: true,
            fullscreen: false,
            borderless: true,
            window_width: 0,
            window_height: 0,
            show_stats: true,
            stats_position: StatsPosition::BottomLeft,
            game_language: GameLanguage::EnglishUS,
            preferred_region: None,
            selected_server: None,
            auto_server_selection: true,
            proxy: None,
            disable_telemetry: true,
        }
    }
}
```

## Example settings.json

```json
{
  "quality": "custom",
  "resolution": "2560x1440",
  "fps": 120,
  "codec": "h265",
  "max_bitrate_mbps": 100,
  "decoder_backend": "auto",
  "color_quality": "bit_10_yuv_420",
  "hdr_enabled": false,
  "audio_codec": "opus",
  "surround": false,
  "vsync": false,
  "low_latency_mode": true,
  "nvidia_reflex": true,
  "mouse_sensitivity": 1.0,
  "raw_input": true,
  "clipboard_paste_enabled": true,
  "fullscreen": false,
  "borderless": true,
  "window_width": 0,
  "window_height": 0,
  "show_stats": true,
  "stats_position": "bottom-left",
  "game_language": "english_us",
  "preferred_region": null,
  "selected_server": null,
  "auto_server_selection": true,
  "proxy": null,
  "disable_telemetry": true
}
```

## Loading and Saving

Settings are automatically loaded on startup and saved on changes:

```rust
// Load settings (returns defaults if file doesn't exist)
let settings = Settings::load()?;

// Save settings
settings.save()?;

// Get resolution as tuple
let (width, height) = settings.resolution_tuple();

// Get bitrate in kbps
let bitrate_kbps = settings.max_bitrate_kbps();
```
