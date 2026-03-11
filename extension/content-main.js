/**
 * CLOE — MAIN world content script.
 *
 * Runs in the page's JavaScript context so it can intercept programmatic
 * navigations (window.open, location.href, location.assign, location.replace)
 * that the ISOLATED world click handler cannot catch.
 *
 * Communication with the ISOLATED world (content.js) uses
 * window.postMessage.
 */
(() => {
  "use strict";

  const MSG_PREFIX = "__cloe__";
  const LOG_PREFIX = "[CLOE]";

  let compiledPatterns = [];
  let interceptAll = false;
  let debugMode = false;

  function debug(...args) {
    if (debugMode) console.log(LOG_PREFIX, ...args);
  }

  function isStandaloneDisplayMode() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches
    );
  }

  function resolveUrl(urlString) {
    try {
      const url = new URL(String(urlString), window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function shouldIntercept(url) {
    if (interceptAll) {
      debug("shouldIntercept → true (interceptAll)");
      return true;
    }
    const match = compiledPatterns.some((re) => re.test(url));
    debug("shouldIntercept →", match, "for", url);
    return match;
  }

  /**
   * Returns the resolved URL if interception should occur, or null.
   */
  function tryIntercept(rawUrl) {
    if (!isStandaloneDisplayMode()) return null;
    const resolved = resolveUrl(rawUrl);
    if (!resolved) return null;
    if (!shouldIntercept(resolved)) return null;
    return resolved;
  }

  /** Ask the ISOLATED world to open the URL via native messaging. */
  function requestExternalOpen(url) {
    debug("Requesting external open:", url);
    window.postMessage({ type: MSG_PREFIX + "open_external", url }, "*");
  }

  // ── Receive settings from ISOLATED world ──────────────────────

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.type !== MSG_PREFIX + "settings") return;

    interceptAll = e.data.interceptAll === true;
    debugMode = e.data.debugMode === true;
    compiledPatterns = (e.data.patterns || [])
      .map((p) => {
        try {
          return new RegExp(p);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    debug("Settings received", {
      interceptAll,
      debugMode,
      patternCount: compiledPatterns.length,
    });
  });

  // ── 1. Override window.open ───────────────────────────────────

  const _open = window.open;
  window.open = function (url, target, features) {
    if (url != null) {
      const resolved = tryIntercept(url);
      if (resolved) {
        debug("window.open intercepted →", resolved);
        requestExternalOpen(resolved);
        return null;
      }
    }
    return _open.apply(this, arguments);
  };

  // ── 2. Override location.assign / location.replace ────────────

  const _assign = Location.prototype.assign;
  const _replace = Location.prototype.replace;

  Location.prototype.assign = function (url) {
    const resolved = tryIntercept(url);
    if (resolved) {
      debug("location.assign intercepted →", resolved);
      requestExternalOpen(resolved);
      return;
    }
    return _assign.call(this, url);
  };

  Location.prototype.replace = function (url) {
    const resolved = tryIntercept(url);
    if (resolved) {
      debug("location.replace intercepted →", resolved);
      requestExternalOpen(resolved);
      return;
    }
    return _replace.call(this, url);
  };

  // ── 3. Override location.href setter ──────────────────────────

  const hrefDesc = Object.getOwnPropertyDescriptor(
    Location.prototype,
    "href"
  );
  if (hrefDesc && hrefDesc.set) {
    Object.defineProperty(Location.prototype, "href", {
      get: hrefDesc.get,
      set(value) {
        const resolved = tryIntercept(value);
        if (resolved) {
          debug("location.href intercepted →", resolved);
          requestExternalOpen(resolved);
          return;
        }
        hrefDesc.set.call(this, value);
      },
      enumerable: hrefDesc.enumerable,
      configurable: hrefDesc.configurable,
    });
  }

  debug("MAIN world interceptors installed");
})();
