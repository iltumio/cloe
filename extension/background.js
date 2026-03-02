const NATIVE_HOST = "com.iltumio.cloe";

function sendNative(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      { url },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          resolve({ ok: false, error: runtimeError.message });
          return;
        }

        if (!response || response.ok !== true) {
          resolve({ ok: false, error: response?.error || "Native host returned failure" });
          return;
        }

        resolve({ ok: true });
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "OPEN_EXTERNAL" || typeof message.url !== "string") {
    return;
  }

  sendNative(message.url)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
