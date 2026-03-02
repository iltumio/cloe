const STORAGE_KEY = "urlPatterns";
const INTERCEPT_ALL_KEY = "interceptAll";
/** Compiled regex list. */
/** Compiled regex list. */
let compiledPatterns = [];
/** When true, intercept every link regardless of patterns. */
let interceptAll = false;

function loadSettings() {
  chrome.storage.sync.get({ [STORAGE_KEY]: [], [INTERCEPT_ALL_KEY]: false }, (data) => {
    interceptAll = data[INTERCEPT_ALL_KEY] === true;
    compiledPatterns = data[STORAGE_KEY]
      .map((p) => {
        try { return new RegExp(p); }
        catch (_) { return null; }
      })
      .filter(Boolean);
  });
}

/** Returns true if the URL should be opened externally. */
function shouldIntercept(url) {
  if (interceptAll) {
    return true;
  }
  return compiledPatterns.some((re) => re.test(url));
}

// Reload settings whenever storage changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes[STORAGE_KEY] || changes[INTERCEPT_ALL_KEY])) {
    loadSettings();
  }
});

loadSettings();

// ── Existing logic ─────────────────────────────────────────────

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

function maybeOpenExternally(event) {
  if (!isStandaloneDisplayMode()) {
    return;
  }

  if (event.defaultPrevented || hasModifierKey(event)) {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor) {
    return;
  }

  if (anchor.hasAttribute("download")) {
    return;
  }

  const href = extractHttpUrl(anchor);
  if (!href) {
    return;
  }

  if (!shouldIntercept(href)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL", url: href }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok !== true) {
      window.location.assign(href);
    }
  });
}

document.addEventListener("click", maybeOpenExternally, true);
