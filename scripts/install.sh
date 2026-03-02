#!/usr/bin/env bash
#
# CLOE — Install script
# Downloads the pre-built native host binary from GitHub Releases
# and registers it as a Chromium native messaging host.
#
# Usage: ./install.sh <extension_id> [version]
#   extension_id  — your CLOE extension ID from chrome://extensions
#   version       — optional tag (default: latest)

set -euo pipefail

REPO="iltumio/cloe"
HOST_NAME="com.iltumio.cloe"
BIN_NAME="cloe-host"

# ── Args ────────────────────────────────────────────────────────

if [[ "${1:-}" == "" ]]; then
  printf "Usage: %s <extension_id> [version]\n" "$0"
  printf "Example: %s abcdefghijklmnopqrstuvwxyzabcdef\n" "$0"
  printf "Example: %s abcdefghijklmnopqrstuvwxyzabcdef v0.1.0\n" "$0"
  exit 1
fi

EXTENSION_ID="$1"
VERSION="${2:-latest}"

# ── Detect platform ─────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
  *)      printf "Unsupported OS: %s\n" "$OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH_LABEL="x86_64" ;;
  aarch64|arm64) ARCH_LABEL="aarch64" ;;
  *)             printf "Unsupported architecture: %s\n" "$ARCH"; exit 1 ;;
esac

ARTIFACT="${BIN_NAME}-${PLATFORM}-${ARCH_LABEL}"

# ── Resolve download URL ────────────────────────────────────────

if [[ "$VERSION" == "latest" ]]; then
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ARTIFACT}"
else
  DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ARTIFACT}"
fi

printf "Downloading %s...\n" "$ARTIFACT"

# ── Download & install binary ───────────────────────────────────

mkdir -p "$HOME/.local/bin"
DEST="$HOME/.local/bin/$BIN_NAME"

if command -v curl &>/dev/null; then
  curl -fSL -o "$DEST" "$DOWNLOAD_URL"
elif command -v wget &>/dev/null; then
  wget -qO "$DEST" "$DOWNLOAD_URL"
else
  printf "Error: curl or wget is required.\n"
  exit 1
fi

chmod +x "$DEST"
printf "Installed binary to %s\n" "$DEST"

# ── Register native messaging host ─────────────────────────────

case "$PLATFORM" in
  linux)
    NMH_DIR="$HOME/.config/chromium/NativeMessagingHosts"
    ;;
  macos)
    NMH_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    ;;
esac

mkdir -p "$NMH_DIR"

cat > "$NMH_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "CLOE — Open links in external default browser",
  "path": "$DEST",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

printf "Registered native messaging host at:\n"
printf "  %s/%s.json\n" "$NMH_DIR" "$HOST_NAME"
printf "\nDone! Restart Chromium and relaunch your PWA windows.\n"
