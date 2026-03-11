const STORAGE_KEY = "urlPatterns";
const INTERCEPT_ALL_KEY = "interceptAll";
const DEBUG_KEY = "debugMode";
const MSG_PREFIX = "__cloe__";

/** Compiled regex list. */
let compiledPatterns = [];
/** Raw pattern strings (forwarded to the MAIN world script). */
let rawPatterns = [];
/** When true, intercept every link regardless of patterns. */
let interceptAll = false;
/** When true, log every interception decision to the console. */
let debugMode = false;

const LOG_PREFIX = "[CLOE]";

function debug(...args) {
  if (debugMode) {
    console.log(LOG_PREFIX, ...args);
  }
}

/** Push current settings to the MAIN world content script. */
function pushSettingsToMainWorld() {
  window.postMessage(
    {
      type: MSG_PREFIX + "settings",
      patterns: rawPatterns,
      interceptAll,
      debugMode,
    },
    "*"
  );
}

function loadSettings() {
  chrome.storage.sync.get(
    { [STORAGE_KEY]: [], [INTERCEPT_ALL_KEY]: false, [DEBUG_KEY]: false },
    (data) => {
      interceptAll = data[INTERCEPT_ALL_KEY] === true;
      debugMode = data[DEBUG_KEY] === true;
      rawPatterns = data[STORAGE_KEY] || [];
      compiledPatterns = rawPatterns
        .map((p) => {
          try { return new RegExp(p); }
          catch (_) { return null; }
        })
        .filter(Boolean);

      debug("Settings loaded", {
        interceptAll,
        debugMode,
        patterns: rawPatterns,
      });
      debug("Display mode:", {
        standalone: window.matchMedia("(display-mode: standalone)").matches,
        windowControlsOverlay: window.matchMedia("(display-mode: window-controls-overlay)").matches,
        current: isStandaloneDisplayMode() ? "standalone" : "browser tab",
      });

      pushSettingsToMainWorld();
    }
  );
}

/** Returns true if the URL should be opened externally. */
function shouldIntercept(url) {
  if (interceptAll) {
    debug("shouldIntercept → true (interceptAll is on)");
    return true;
  }
  const match = compiledPatterns.some((re) => re.test(url));
  debug("shouldIntercept →", match, "for", url, "against", compiledPatterns.length, "pattern(s)");
  return match;
}

// Reload settings whenever storage changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes[STORAGE_KEY] || changes[INTERCEPT_ALL_KEY] || changes[DEBUG_KEY])) {
    loadSettings();
  }
});

loadSettings();

// ── Helpers ────────────────────────────────────────────────────

function isStandaloneDisplayMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches;
}

function hasModifierKey(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function extractHttpUrl(anchor) {
  if (!anchor || typeof anchor.href !== "string" || anchor.href.length === 0) {
    return null;
  }

  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch (_) {
    return null;
  }
}

/** Send a URL to the background for native-host opening. */
function openExternally(url) {
  chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL", url }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok !== true) {
      const error = chrome.runtime.lastError?.message || response?.error || "unknown";
      debug("Native messaging failed, falling back to in-app navigation:", error);
      window.location.assign(url);
    } else {
      debug("Native host opened URL successfully");
    }
  });
}

// ── Click handler (existing — handles <a> tags) ────────────────

function maybeOpenExternally(event) {
  if (!isStandaloneDisplayMode()) {
    debug("Skip: not in standalone display mode");
    return;
  }

  if (event.defaultPrevented || hasModifierKey(event)) {
    debug("Skip: defaultPrevented or modifier key held");
    return;
  }

  if (event.button !== 0) {
    debug("Skip: not a left click (button =", event.button + ")");
    return;
  }

  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor) {
    return;
  }

  if (anchor.hasAttribute("download")) {
    debug("Skip: anchor has download attribute");
    return;
  }

  const href = extractHttpUrl(anchor);
  if (!href) {
    debug("Skip: no valid HTTP(S) URL from anchor", anchor.href);
    return;
  }

  if (!shouldIntercept(href)) {
    debug("Skip: URL did not match any pattern:", href);
    return;
  }

  debug("Intercepting click →", href);
  event.preventDefault();
  event.stopPropagation();

  openExternally(href);
}

document.addEventListener("click", maybeOpenExternally, true);

// ── Bridge: receive intercept requests from MAIN world ─────────

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (!e.data || e.data.type !== MSG_PREFIX + "open_external") return;

  const url = e.data.url;
  if (typeof url !== "string" || url.length === 0) return;

  debug("Received open-external from MAIN world:", url);
  openExternally(url);
});
