#!/usr/bin/env bash
#
# CLOE — One-line installer
# Downloads the extension + native host binary, walks you through setup.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/iltumio/cloe/main/scripts/install-all.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/iltumio/cloe/main/scripts/install-all.sh | bash -s -- [version] [chromium|firefox]
#

set -euo pipefail

REPO="iltumio/cloe"
HOST_NAME="com.iltumio.cloe"
BIN_NAME="cloe-host"
INSTALL_DIR="$HOME/.local/share/cloe"
VERSION="${1:-latest}"
BROWSER="${2:-chromium}"
case "$BROWSER" in
  chromium|firefox) ;;
  *) err_msg="Unsupported browser: $BROWSER"; printf "%s\n" "$err_msg" >&2; exit 1 ;;
esac

# ── Helpers ────────────────────────────────────────────────────

info()  { printf "\033[1;34m▸\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
err()   { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; }
bold()  { printf "\033[1m%s\033[0m" "$*"; }

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    err "$1 is required but not installed."
    exit 1
  fi
}

download() {
  local url="$1" dest="$2"
  if command -v curl &>/dev/null; then
    curl -fSL -o "$dest" "$url"
  elif command -v wget &>/dev/null; then
    wget -qO "$dest" "$url"
  else
    err "curl or wget is required."
    exit 1
  fi
}

# ── Detect platform ─────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
  *)      err "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH_LABEL="x86_64" ;;
  aarch64|arm64) ARCH_LABEL="aarch64" ;;
  *)             err "Unsupported architecture: $ARCH"; exit 1 ;;
esac

require_cmd unzip

# ── Resolve download URLs ──────────────────────────────────────

if [[ "$VERSION" == "latest" ]]; then
  BASE_URL="https://github.com/${REPO}/releases/latest/download"
else
  BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"
fi

ARTIFACT="${BIN_NAME}-${PLATFORM}-${ARCH_LABEL}"
BINARY_URL="${BASE_URL}/${ARTIFACT}"
EXTENSION_ARTIFACT="cloe-extension.zip"
if [[ "$BROWSER" == "firefox" ]]; then
  EXTENSION_ARTIFACT="cloe-extension-firefox.zip"
fi
EXTENSION_URL="${BASE_URL}/${EXTENSION_ARTIFACT}"

printf "\n"
info "CLOE Installer — ${PLATFORM}/${ARCH_LABEL}"
printf "\n"

# ── Step 1: Download & install native host binary ──────────────

info "Downloading native host binary..."

mkdir -p "$HOME/.local/bin"
DEST="$HOME/.local/bin/$BIN_NAME"
download "$BINARY_URL" "$DEST"
chmod +x "$DEST"
ok "Installed binary to $DEST"

# ── Step 2: Download & unzip extension ─────────────────────────

info "Downloading extension..."

mkdir -p "$INSTALL_DIR"
EXTENSION_ZIP="$(mktemp)"
download "$EXTENSION_URL" "$EXTENSION_ZIP"

if [[ "$BROWSER" == "firefox" ]]; then
  INSTALL_DIR="$INSTALL_DIR/firefox"
fi
mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/extension"
unzip -qo "$EXTENSION_ZIP" -d "$INSTALL_DIR/extension"
rm -f "$EXTENSION_ZIP"
ok "Extension unpacked to $INSTALL_DIR/extension"

# ── Step 3: Prompt user to load extension ──────────────────────

printf "\n"
if [[ "$BROWSER" == "firefox" ]]; then
  info "Open about:debugging#/runtime/this-firefox in Firefox 140 or newer."
  info "Choose Load Temporary Add-on and select $INSTALL_DIR/extension/manifest.json"
  info "Temporary add-ons must be loaded again after restarting Firefox."
  EXTENSION_ID="cloe@iltumio.dev"
else
  printf "  ┌─────────────────────────────────────────────────────────┐\n"
  printf "  │  Now load the extension in Chromium:                    │\n"
  printf "  │                                                         │\n"
  printf "  │  1. Open $(bold 'chrome://extensions')                          │\n"
  printf "  │  2. Enable $(bold 'Developer mode') (top-right toggle)          │\n"
  printf "  │  3. Click $(bold 'Load unpacked')                               │\n"
  printf "  │  4. Select: %-43s │\n" "$INSTALL_DIR/extension"
  printf "  │  5. Copy the $(bold 'extension ID') shown under the name        │\n"
  printf "  └─────────────────────────────────────────────────────────┘\n"
  printf "\n"

  # ── Step 4: Read extension ID ─────────────────────────────────

  if [[ ! -t 0 ]]; then
    # stdin is piped (curl | bash), reopen from terminal
    exec < /dev/tty
  fi

  while true; do
    printf "  Paste your extension ID: "
    read -r EXTENSION_ID

    # Chromium extension IDs are 32 letters a-p
    if [[ "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
      break
    fi
    err "Invalid extension ID. It should be 32 letters a-p (e.g. abcdefghijklmnopabcdefghijklmnop)"
  done

fi

# ── Step 5: Register native messaging host ─────────────────────

case "$PLATFORM" in
  linux)
    NMH_DIR="$HOME/.config/chromium/NativeMessagingHosts"
    ;;
  macos)
    NMH_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    ;;
esac

if [[ "$BROWSER" == "firefox" ]]; then
  case "$PLATFORM" in
    linux) NMH_DIR="$HOME/.mozilla/native-messaging-hosts" ;;
    macos) NMH_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts" ;;
  esac
fi

mkdir -p "$NMH_DIR"

ALLOW_KEY="allowed_origins"
ALLOW_VALUE="chrome-extension://$EXTENSION_ID/"
if [[ "$BROWSER" == "firefox" ]]; then
  ALLOW_KEY="allowed_extensions"
  ALLOW_VALUE="$EXTENSION_ID"
fi
# Escape path characters for JSON (HOME may contain spaces, quotes or backslashes).
JSON_DEST="${DEST//\\/\\\\}"
JSON_DEST="${JSON_DEST//\"/\\\"}"

cat > "$NMH_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "CLOE — Open links in external default browser",
  "path": "$JSON_DEST",
  "type": "stdio",
  "$ALLOW_KEY": [
    "$ALLOW_VALUE"
  ]
}
EOF

ok "Registered native messaging host"
printf "  %s/%s.json\n" "$NMH_DIR" "$HOST_NAME"

# ── Done ───────────────────────────────────────────────────────

printf "\n"
ok "All done! Restart $BROWSER and reload the extension if it was loaded temporarily."
printf "\n"
