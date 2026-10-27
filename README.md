# CLOE — Custom Links Opened Externally

A Chromium and Firefox extension that routes matching links to your default browser, application deep links, or custom commands.

It uses:
- A shared MV3 extension to intercept link clicks in PWA windows and, optionally, browser tabs
- A Rust native messaging host to open URLs through the OS or launch your configured executable with arguments
- Configurable URL patterns (regex) to control which links are intercepted

## Quick Install

Run the one-liner — it downloads everything and walks you through setup:

```bash
curl -fsSL https://raw.githubusercontent.com/iltumio/cloe/main/scripts/install-all.sh | bash
```

Or install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/iltumio/cloe/main/scripts/install-all.sh | bash -s -- v0.1.0
```

The script will:
1. Download the native host binary (auto-detects OS and architecture)
2. Download and unpack the extension to `~/.local/share/cloe/extension`
3. Prompt you to load the extension in Chromium and paste the extension ID
4. Register the native messaging host

### Manual install

<details>
<summary>Click to expand step-by-step instructions</summary>

#### 1. Load the extension

- Download `cloe-extension.zip` from the [latest release](https://github.com/iltumio/cloe/releases/latest) and unzip it
- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked** and select the unzipped folder
- Copy the extension ID

#### 2. Install the native host

Run the install script (replace `<extension_id>` with your ID from step 1):

```bash
curl -fsSL https://raw.githubusercontent.com/iltumio/cloe/main/scripts/install.sh | bash -s -- <extension_id>
```

Or to install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/iltumio/cloe/main/scripts/install.sh | bash -s -- <extension_id> v0.1.0
```

The script auto-detects your OS and architecture (Linux/macOS, x86_64/aarch64), downloads the correct binary, and registers the native messaging host.

#### 3. Restart Chromium and relaunch your PWA windows.

</details>

## Building from source

If you prefer to build locally instead of using pre-built binaries:

```bash
git clone https://github.com/iltumio/cloe.git
cd cloe
./scripts/install-native-host.sh <extension_id>
```

This requires a [Rust toolchain](https://rustup.rs/).

## Firefox desktop (140 or newer)

Build the browser packages and install the native messaging host from this checkout:

```bash
python3 scripts/package-extension.py
./scripts/install-native-host.sh firefox
```

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on** and select `dist/cloe-extension-firefox/manifest.json`.
3. Open CLOE's preferences from `about:addons`, check that the native host is connected, and add your URL patterns.
4. Click a matching HTTP(S) link in a normal page to open it through the system default browser.

Firefox intercepts links in ordinary tabs by default. Chromium continues to intercept only PWA links by default. Both browsers expose **Intercept links in browser tabs too** in settings. Leave **Intercept all links** off to route only your regex matches.

Temporary Firefox add-ons are removed on browser restart. Permanent installation in standard Firefox requires a Mozilla-signed add-on; the generated ZIP is an unsigned package for testing/submission, not a signed release. Firefox's site-access permission must allow CLOE to run on the pages you use. Restricted pages such as `about:` pages and Mozilla's add-on site cannot be intercepted.

Once a release containing these changes is published, the download installers also support Firefox:

```bash
# Native host only (fixed extension ID: cloe@iltumio.dev)
./scripts/install.sh firefox
# Extension + host; prints temporary-loading instructions
./scripts/install-all.sh latest firefox
```

The native host uses Firefox's `allowed_extensions` registration and Mozilla's native-messaging directory on Linux and macOS. These paths target a regular Firefox installation; sandboxed Snap/Flatpak installations may need additional native-messaging integration.

## Configuration

Open the extension options (`chrome://extensions` → CLOE → Details → Extension options, or `about:addons` → CLOE → Preferences in Firefox) to:

- **Intercept links in browser tabs too** — apply the same rules outside standalone PWA windows
- **Intercept all links** — toggle to open every link externally
- **Routing rules** — match URLs with a regex and select the default browser, an application deep link, or a custom command. The first matching rule wins; use the arrows to change priority. Existing regex entries keep their default-browser destination.
- **Presets** — quickly add patterns for popular services (Google Meet, Zoom, Teams, etc.)

If no patterns are configured and "Intercept all" is off, no links are intercepted.

## Deep links and custom commands

Add a regex, choose **Open with**, and save. You can edit or reorder existing rules. Specific rules still apply when **Intercept all links** is enabled; other links use the default browser.

For Linear, for example:

- Regex: `^https://linear\.app/(.*)$`
- Destination: **Application deep link**
- Template: `linear://{1}` (or `linear://{host}{path}{query}{hash}`, depending on the URL format your installed app accepts)

Deep links use the system's registered protocol handler. The corresponding application must already be installed and registered for that protocol.

For an Omarchy webapp, choose **Custom command** and click **Omarchy: open webapp**. This sets executable `omarchy` with three arguments, one per line:

```text
launch
webapp
{url}
```

**Omarchy: launch or focus** instead configures:

```text
launch
or
focus
webapp
Linear
{url}
```

Replace `Linear` with the window pattern for your webapp. Omarchy focuses a matching existing window without changing its page; otherwise it launches the supplied URL. These shortcuts use the installed Omarchy CLI; you can also specify any executable name on the browser's PATH or an absolute path to your own script.

Arguments are entered **one per line, without surrounding quotes**. An argument can contain spaces. No shell expansion, pipes, `&&`, or command substitution is performed by CLOE. Put more involved logic in a script, then select that script as the executable. The program path itself cannot contain template placeholders.

Templates in deep links and command arguments support:

- `{url}`: the original HTTP(S) URL; `{encodedUrl}`: percent-encoded URL for embedding in a query parameter.
- `{host}`, `{path}`, `{query}`, `{hash}`: URL parts (`path` starts with `/`, query includes `?`, fragment includes `#`).
- `{1}`, `{2}`, …: regex capture groups; `{0}` is the full match. Unmatched optional groups become empty strings.

Rules and destinations are resolved in the extension background from saved settings. A page cannot supply its own executable through a link or message. A failure to resolve a rule or start the native process falls back to ordinary navigation; a successfully started program may still fail later, outside CLOE's control.

After updating, rebuild/reinstall the native host and reload the extension so both speak the new action protocol. For this machine's Zen installation, run `./scripts/install-native-host.sh firefox`, copy the rebuilt Firefox package to the directory you loaded, then click **Reload** in `about:debugging` and refresh source pages.

## Supported platforms

| OS    | Architecture | Binary                    |
|-------|-------------|---------------------------|
| Linux | x86_64      | `cloe-host-linux-x86_64`  |
| Linux | aarch64     | `cloe-host-linux-aarch64` |
| macOS | x86_64      | `cloe-host-macos-x86_64`  |
| macOS | aarch64     | `cloe-host-macos-aarch64` |

## Structure

- `extension/` — Shared extension sources (Chromium MV3 manifest)
- `native-host/` — Rust native messaging host
- `scripts/install-all.sh` — One-line installer (extension + native host)
- `scripts/install.sh` — Download + install native host only (requires extension ID)
- `scripts/install-native-host.sh` — Build from source + install

## Development checks

```bash
node --test tests/*.test.cjs
python3 tests/installers.py
python3 tests/native-host.py
python3 scripts/package-extension.py
npx --yes web-ext@10.8.0 lint --source-dir dist/cloe-extension-firefox --warnings-as-errors
```

The packager preserves the Chromium service worker and generates a Firefox event-page manifest with a stable add-on ID. Release CI publishes both `cloe-extension.zip` and `cloe-extension-firefox.zip`.

## Notes

- CLOE intercepts ordinary HTTP(S) link clicks and matching `window.open` calls in enabled contexts. Hooks for `location` navigation are best-effort because browsers can make these properties unforgeable. Address-bar navigation, server redirects, and every possible page navigation are not guaranteed to be intercepted.
- Clicking a link in the destination browser can trigger CLOE again if tab interception is enabled there.
- If native messaging fails, it falls back to in-app navigation.
- Re-run the install script whenever the extension ID changes.

## License

[MIT](LICENSE)
