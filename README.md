# CLOE — Custom Links Opened Externally

A Chromium extension that selectively opens links from PWAs in your system default browser.

It uses:
- A Chromium MV3 extension to intercept link clicks in standalone PWA windows
- A Rust native messaging host to call `xdg-open <url>` (Linux) or `open <url>` (macOS)
- Configurable URL patterns (regex) to control which links are intercepted

## Install

### 1. Load the extension

- Download `cloe-extension.zip` from the [latest release](https://github.com/iltumio/cloe/releases/latest) and unzip it
- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked** and select the unzipped folder
- Copy the extension ID

### 2. Install the native host

Run the install script (replace `<extension_id>` with your ID from step 1):

```bash
curl -fsSL https://raw.githubusercontent.com/iltumio/cloe/main/scripts/install.sh | bash -s -- <extension_id>
```

Or to install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/iltumio/cloe/main/scripts/install.sh | bash -s -- <extension_id> v0.1.0
```

The script auto-detects your OS and architecture (Linux/macOS, x86_64/aarch64), downloads the correct binary, and registers the native messaging host.

### 3. Restart Chromium and relaunch your PWA windows.

## Building from source

If you prefer to build locally instead of using pre-built binaries:

```bash
git clone https://github.com/iltumio/cloe.git
cd cloe
./scripts/install-native-host.sh <extension_id>
```

This requires a [Rust toolchain](https://rustup.rs/).

## Configuration

Open the extension options (`chrome://extensions` → CLOE → Details → Extension options) to:

- **Intercept all links** — toggle to open every link externally
- **URL patterns** — add regex patterns for specific URLs (e.g. `^https://meet\.google\.com/`)
- **Presets** — quickly add patterns for popular services (Google Meet, Zoom, Teams, etc.)

If no patterns are configured and "Intercept all" is off, no links are intercepted.

## Supported platforms

| OS    | Architecture | Binary                    |
|-------|-------------|---------------------------|
| Linux | x86_64      | `cloe-host-linux-x86_64`  |
| Linux | aarch64     | `cloe-host-linux-aarch64` |
| macOS | x86_64      | `cloe-host-macos-x86_64`  |
| macOS | aarch64     | `cloe-host-macos-aarch64` |

## Structure

- `extension/` — Chromium extension (MV3)
- `native-host/` — Rust native messaging host
- `scripts/install.sh` — Download + install from GitHub Releases
- `scripts/install-native-host.sh` — Build from source + install

## Notes

- This intercepts normal left-click HTTP(S) links in standalone PWA display mode.
- If native messaging fails, it falls back to in-app navigation.
- Re-run the install script whenever the extension ID changes.

## License

[MIT](LICENSE)
