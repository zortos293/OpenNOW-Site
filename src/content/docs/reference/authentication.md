---
title: Authentication
description: OAuth authentication and Alliance Partner support in OpenNow Streamer
---

OpenNow Streamer uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) to authenticate users with NVIDIA accounts. This document covers the authentication flow, token management, and Alliance Partner support.

## OAuth Configuration

The client uses the following OAuth parameters:

| Parameter | Value |
|-----------|-------|
| Client ID | `ZU7sPN-miLujMD95LfOQ453IB0AtjM8sMyvgJ9wCXEQ` |
| Scopes | `openid consent email tk_client age` |
| Default IDP ID | `PDiAhv2kJTFeQ7WOPqiQ2tRZ7lGhR2X11dXvM4TZSxg` |
| Authorization URL | `https://login.nvidia.com/authorize` |
| Token URL | `https://login.nvidia.com/token` |
| Userinfo URL | `https://login.nvidia.com/userinfo` |

## PKCE Flow

OpenNow uses the PKCE extension to OAuth for secure authorization without a client secret:

```
1. Generate PKCE Challenge
   ├── Create 64-character random verifier (alphanumeric)
   └── SHA256 hash verifier → Base64URL encode → challenge

2. Build Authorization URL
   ├── client_id, redirect_uri, scope
   ├── code_challenge (from step 1)
   ├── code_challenge_method=S256
   └── idp_id (Alliance Partner ID)

3. Open Browser → User Authenticates

4. Local Callback Server
   ├── Listen on ports: 2259, 6460, 7119, 8870, 9096
   └── Receive authorization code

5. Exchange Code for Tokens
   ├── POST /token with code + code_verifier
   └── Receive access_token, refresh_token, id_token
```

### Redirect Ports

The callback server attempts to bind on these ports in order:

```rust
const REDIRECT_PORTS: [u16; 5] = [2259, 6460, 7119, 8870, 9096];
```

If all ports are unavailable, authentication will fail.

## Token Structure

```rust
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub expires_at: i64,  // Unix timestamp
}
```

### Token Methods

| Method | Description |
|--------|-------------|
| `is_expired()` | Returns true if current time >= expires_at |
| `should_refresh()` | Returns true if token expires within 10 minutes |
| `can_refresh()` | Returns true if refresh_token is present |
| `jwt()` | Returns id_token if available, else access_token |
| `user_id()` | Extracts `sub` claim from JWT |

## Token Refresh

Tokens are automatically refreshed when they expire or are close to expiring:

```rust
pub async fn refresh_token(refresh_token: &str) -> Result<AuthTokens> {
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", CLIENT_ID),
    ];
    
    // POST to https://login.nvidia.com/token
    // Returns new access_token, refresh_token, id_token
}
```

## Alliance Partners

OpenNOW supports Alliance Partners in addition to the default NVIDIA login:

| Provider Code | Display Name |
|---------------|--------------|
| NVIDIA | NVIDIA |
| KDD | au |
| TWM | Taiwan Mobile |
| BPC | bro.game |

### Fetching Providers

Providers are fetched from the Service URLs API:

```
GET https://pcs.geforcenow.com/v1/serviceUrls
```

Response structure:

```rust
pub struct LoginProvider {
    pub idp_id: String,                    // OAuth IDP ID
    pub login_provider_code: String,       // "NVIDIA", "KDD", etc.
    pub login_provider_display_name: String,
    pub streaming_service_url: String,     // CloudMatch base URL
    pub login_provider_priority: i32,      // Sort order
}
```

### Using Alliance Partners

1. **Fetch providers** at startup via `fetch_login_providers()`
2. **User selects provider** in the login UI
3. **Set provider** via `set_login_provider(provider)`
4. **Build auth URL** includes the provider's `idp_id`
5. **CloudMatch API** uses the provider's `streaming_service_url`

```rust
// Get streaming base URL for selected provider
pub fn get_streaming_base_url() -> String {
    let provider = get_selected_provider();
    provider.streaming_service_url
}
```

## User-Agent

All authentication requests use the official GFN CEF User-Agent:

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 
(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 
NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173
```

The CEF Origin header is set to:
```
https://nvfile
```

## Device ID

A stable device ID is generated for each machine:

1. **Try official GFN config**: Read from `%LOCALAPPDATA%\NVIDIA Corporation\GeForceNOW\sharedstorage.json`
2. **Fallback**: Generate SHA256 hash from `COMPUTERNAME + USERNAME + "opennow-streamer"`

## User Info

User information is extracted from the JWT or fetched from `/userinfo`:

```rust
pub struct UserInfo {
    pub user_id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub membership_tier: String,  // "FREE", "PRIORITY", "ULTIMATE"
}
```

### JWT Claims

The id_token contains these relevant claims:

| Claim | Description |
|-------|-------------|
| `sub` | User ID |
| `email` | User email address |
| `preferred_username` | Display name |
| `gfn_tier` | Membership tier |
| `picture` | Avatar URL |

## Error Handling

Common authentication errors:

| Error | Cause | Solution |
|-------|-------|----------|
| "No authorization code in callback" | User cancelled login | Retry login |
| "Token exchange failed" | Invalid code or verifier | Restart login flow |
| "Token refresh failed" | Refresh token expired | Full re-authentication |
| "Service URLs API error" | API unavailable | Use default NVIDIA provider |

## Token Persistence

Tokens are cached to disk for session resumption:

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\opennow-streamer\auth_cache.json` |
| macOS | `~/Library/Application Support/opennow-streamer/auth_cache.json` |
| Linux | `~/.config/opennow-streamer/auth_cache.json` |

The selected login provider is also persisted for automatic selection on restart.
