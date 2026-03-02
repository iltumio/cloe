#!/usr/bin/env bash

set -euo pipefail

if [[ "${1:-}" == "" ]]; then
  printf "Usage: %s <extension_id>\n" "$0"
  printf "Example: %s abcdefghijklmnopqrstuvwxyzabcdef\n" "$0"
  exit 1
fi

EXTENSION_ID="$1"
HOST_NAME="com.iltumio.cloe"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST_DIR="$PROJECT_DIR/native-host"

printf "Building native host...\n"
cargo build --release --manifest-path "$HOST_DIR/Cargo.toml"

mkdir -p "$HOME/.local/bin"
install -m 0755 "$HOST_DIR/target/release/cloe-host" "$HOME/.local/bin/cloe-host"

mkdir -p "$HOME/.config/chromium/NativeMessagingHosts"

cat > "$HOME/.config/chromium/NativeMessagingHosts/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "CLOE — Open links in external default browser",
  "path": "$HOME/.local/bin/cloe-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

printf "Installed native messaging host at:\n"
printf "  %s/.config/chromium/NativeMessagingHosts/%s.json\n" "$HOME" "$HOST_NAME"
printf "\n"
printf "Next:\n"
printf "1) Load extension from: %s/extension\n" "$PROJECT_DIR"
printf "2) Restart Chromium + your PWA windows\n"
