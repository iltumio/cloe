#!/usr/bin/env bash

set -euo pipefail

if [[ "${1:-}" == "" ]]; then
  printf "Usage: %s <extension_id|firefox>\n" "$0"
  printf "Example: %s abcdefghijklmnopabcdefghijklmnop\n" "$0"
  exit 1
fi

EXTENSION_ID="$1"
BROWSER="chromium"
if [[ "$EXTENSION_ID" == "firefox" ]]; then
  BROWSER="firefox"
  EXTENSION_ID="cloe@iltumio.dev"
elif [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  printf "Expected a Chromium extension ID (32 letters a-p), or firefox.\n" >&2
  exit 1
fi
HOST_NAME="com.iltumio.cloe"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_DIR="$PROJECT_DIR/native-host"

printf "Building native host...\n"
cargo build --release --manifest-path "$HOST_DIR/Cargo.toml"

mkdir -p "$HOME/.local/bin"
install -m 0755 "$HOST_DIR/target/release/cloe-host" "$HOME/.local/bin/cloe-host"

case "$(uname -s)" in
  Linux) NMH_DIR="$HOME/.config/chromium/NativeMessagingHosts" ;;
  Darwin) NMH_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts" ;;
  *) printf "Unsupported OS\n" >&2; exit 1 ;;
esac
DEST="$HOME/.local/bin/cloe-host"
if [[ "$BROWSER" == "firefox" ]]; then
  case "$(uname -s)" in
    Linux) NMH_DIR="$HOME/.mozilla/native-messaging-hosts" ;;
    Darwin) NMH_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts" ;;
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

printf "Installed native messaging host at:\n"
printf "  %s/%s.json\n" "$NMH_DIR" "$HOST_NAME"
printf "\n"
printf "Next:\n"
if [[ "$BROWSER" == "firefox" ]]; then
  printf "1) Run python3 scripts/package-extension.py, then load dist/cloe-extension-firefox/manifest.json via about:debugging\n"
else
  printf "1) Load extension from: %s/extension\n" "$PROJECT_DIR"
fi
printf "2) Restart %s (reload temporary add-ons in Firefox)\n" "$BROWSER"
