// Firefox loads rules.js before this event page; Chromium uses a service worker.
if (typeof importScripts === "function") importScripts("rules.js");

const NATIVE_HOST = "com.iltumio.cloe";
const DEBUG_KEY = "debugMode";

let debugMode = false;

const LOG_PREFIX = "[CLOE background]";

function debug(...args) {
  if (debugMode) {
    console.log(LOG_PREFIX, ...args);
  }
}

function loadDebugSetting() {
  chrome.storage.sync.get({ [DEBUG_KEY]: false }, (data) => {
    debugMode = data[DEBUG_KEY] === true;
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[DEBUG_KEY]) {
    loadDebugSetting();
  }
});

loadDebugSetting();

async function sendNative(url) {
  // Resolve from extension storage only. Never trust an action supplied by a page.
  const settings = await chrome.storage.sync.get({ urlPatterns: [], interceptAll: false });
  const action = CloeRules.selectAction(settings.urlPatterns, url, settings.interceptAll === true);
  debug("Sending to native host:", url);
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      { url, action },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          debug("Native host error:", runtimeError.message);
          resolve({ ok: false, error: runtimeError.message });
          return;
        }

        if (!response || response.ok !== true) {
          const error = response?.error || "Native host returned failure";
          debug("Native host failure:", error);
          resolve({ ok: false, error });
          return;
        }

        debug("Native host success for:", url);
        resolve({ ok: true });
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return;

  if (message.type === "PING_NATIVE") {
    debug("Received PING_NATIVE");
    // Send an invalid-scheme URL so the host responds without side effects.
    chrome.runtime.sendNativeMessage(NATIVE_HOST, { url: "cloe://ping" }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        debug("Ping failed:", runtimeError.message);
        sendResponse({ reachable: false, error: runtimeError.message });
        return;
      }
      // Any structured response (even an error about the URL scheme) means the host is alive.
      debug("Ping success — native host is reachable");
      sendResponse({ reachable: true });
    });
    return true;
  }

  if (message.type === "OPEN_EXTERNAL" && typeof message.url === "string") {
    debug("Received OPEN_EXTERNAL for:", message.url);
    sendNative(message.url)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});
