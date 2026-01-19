<h1 align="center">OpenNOW Documentation</h1>

<p align="center">
  <strong>Documentation site for OpenNOW - the open source GeForce NOW client</strong>
</p>

<p align="center">
  <a href="https://opennow.zortos.me">
    <img src="https://img.shields.io/badge/Docs-opennow.zortos.me-blue?style=for-the-badge" alt="Documentation">
  </a>
  <a href="https://github.com/zortos293/OpenNOW">
    <img src="https://img.shields.io/badge/Main_Repo-GFNClient-green?style=for-the-badge&logo=github" alt="Main Repository">
  </a>
  <a href="https://discord.gg/8EJYaJcNfD">
    <img src="https://img.shields.io/badge/Discord-Join_Us-7289da?style=for-the-badge&logo=discord" alt="Discord">
  </a>
</p>

---

## About

This repository contains the documentation website for [OpenNOW](https://github.com/zortos293/OpenNOW), an open source native GeForce NOW client built in Rust.

**Live Documentation:** [https://opennow.zortos.me](https://opennow.zortos.me)

## Documentation Contents

- **Getting Started** - Download releases or build from source
- **Architecture Overview** - How OpenNOW works internally
- **Reference Documentation**
  - Authentication (OAuth, PKCE, Alliance Partners)
  - WebRTC (Signaling, SDP, Data Channels)
  - Media Pipeline (Video/Audio decoding, Hardware acceleration)
  - Input System (Mouse, Keyboard, Gamepad, Racing Wheels)
  - Configuration (All settings and options)

## Development

This documentation site is built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build).

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Project Structure

```
src/
├── assets/          # Images and static assets
└── content/
    └── docs/        # Documentation pages (Markdown/MDX)
        ├── index.mdx
        ├── guides/
        ├── architecture/
        └── reference/
```

---

<p align="center">
  <a href="https://github.com/zortos293/OpenNOW">OpenNOW Main Repository</a> · 
  <a href="https://opennow.zortos.me">Documentation</a> · 
  <a href="https://discord.gg/8EJYaJcNfD">Discord</a>
</p>
