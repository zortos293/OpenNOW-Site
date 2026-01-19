---
title: Getting Started
description: How to download or build OpenNow Streamer
---

OpenNow Streamer is a native GeForce NOW client built in Rust. This guide covers downloading pre-built releases and building from source.

## Download Pre-Built Releases

The easiest way to get started is to download a pre-built release from [GitHub Releases](https://github.com/zortos293/OpenNOW/releases).

| Platform | Download | Notes |
|----------|----------|-------|
| **Windows x64** | `OpenNOW-windows-x64.zip` | Portable, GStreamer bundled |
| **Windows ARM64** | `OpenNOW-windows-arm64.zip` | Surface Pro X, etc. GStreamer bundled |
| **macOS (Apple Silicon)** | `OpenNOW-macos-arm64.zip` | M1/M2/M3 native, FFmpeg bundled. Intel Macs can use Rosetta 2 |
| **Linux x64** | `OpenNOW-linux-x64.AppImage` | AppImage with GStreamer bundled |
| **Linux ARM64** | `OpenNOW-linux-arm64.zip` | Requires system GStreamer (see below) |

### Linux ARM64 Setup

Linux ARM64 users need to install GStreamer via their package manager:

```bash
# Ubuntu/Debian
sudo apt install gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav

# Fedora/RHEL
sudo dnf install gstreamer1-plugins-base gstreamer1-plugins-good \
  gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free gstreamer1-libav

# Arch
sudo pacman -S gstreamer gst-plugins-base gst-plugins-good \
  gst-plugins-bad gst-plugins-ugly gst-libav
```

Then extract the zip and run with `./run.sh` (uses bundled libraries with system fallback).

---

## Building from Source

If you want to build from source, you'll need the following prerequisites:

### All Platforms

- **Rust** 1.75+ (install via [rustup](https://rustup.rs/))
- **Git** for cloning the repository
- A valid **GeForce NOW account** (Free, Priority, or Ultimate tier)

### Windows

- **Visual Studio 2022** Build Tools with C++ workload
- **GStreamer** 1.20+ MSVC (install via Chocolatey: `choco install gstreamer gstreamer-devel`)

### macOS

- **Xcode Command Line Tools** (`xcode-select --install`)
- **FFmpeg** via Homebrew: `brew install ffmpeg pkg-config`

### Linux

- **Build essentials**: `sudo apt install build-essential pkg-config clang libclang-dev`
- **GStreamer dev**: `sudo apt install libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libgstreamer-plugins-bad1.0-dev`
- **GStreamer plugins**: `sudo apt install gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav`
- **Audio/Input**: `sudo apt install libasound2-dev libx11-dev libxi-dev libudev-dev`

## Building

Clone the repository and build with Cargo:

```bash
git clone https://github.com/zortos293/opennow-streamer.git
cd opennow-streamer

# Debug build (faster compilation)
cargo build

# Release build (optimized, recommended for use)
cargo build --release
```

### Build with Tracy Profiler

For performance analysis, build with Tracy integration:

```bash
cargo build --release --features tracy
```

Then connect with the [Tracy Profiler](https://github.com/wolfpld/tracy) application.

## Running

```bash
# Debug mode
cargo run

# Release mode (recommended)
cargo run --release
```

The application will open a window with the login screen.

## First Launch

1. **Select Provider**: Choose NVIDIA or an Alliance Partner (au, Taiwan Mobile, etc.)
2. **Login**: Click "Login with NVIDIA" to open the browser authentication
3. **Authorize**: Sign in with your NVIDIA account and grant permissions
4. **Browse Games**: After login, browse available games in the library
5. **Launch**: Click a game to start a streaming session

## Configuration

Settings are stored in:

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\opennow-streamer\settings.json` |
| macOS | `~/Library/Application Support/opennow-streamer/settings.json` |
| Linux | `~/.config/opennow-streamer/settings.json` |

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `resolution` | `1920x1080` | Stream resolution |
| `fps` | `60` | Target frame rate (60, 120, 240) |
| `codec` | `H265` | Video codec (H264, H265, AV1) |
| `max_bitrate_mbps` | `50` | Maximum bitrate in Mbps |
| `decoder_backend` | `Auto` | Decoder selection (Auto, FFmpeg, Native, GStreamer) |
| `fullscreen` | `false` | Start in fullscreen mode |
| `borderless` | `false` | Use borderless fullscreen |
| `low_latency_mode` | `true` | Enable low-latency optimizations |

## Troubleshooting

### "Failed to create video decoder"

- Ensure FFmpeg libraries are installed
- Try setting `decoder_backend` to `FFmpeg` in settings
- On Linux, ensure GStreamer plugins are installed

### "Signaling connection failed"

- Check your internet connection
- Verify your GeForce NOW account is active
- Try a different server region in settings

### "Input not working"

- Press `F8` to toggle mouse capture
- Ensure the window is focused
- On Linux, you may need to run with elevated permissions for raw input

### Black screen after connection

- Press `F3` to show stats and verify frames are being received
- Try requesting a keyframe by pressing `Ctrl+Shift+K`
- Change the codec in settings (try H.264 if H.265 isn't working)
