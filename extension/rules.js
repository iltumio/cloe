/* Shared by the options page, isolated content script and background. */
(() => {
  "use strict";
  function normalizeRules(value) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((rule) => {
      if (typeof rule === "string") return [{ pattern: rule, action: { type: "default" } }];
      if (!rule || typeof rule.pattern !== "string") return [];
      return [{ pattern: rule.pattern, action: rule.action ?? { type: "default" } }];
    });
  }

  function expand(template, url, match) {
    if (typeof template !== "string") throw new Error("Template must be text.");
    const parsed = new URL(url);
    const values = {
      url, encodedUrl: encodeURIComponent(url), host: parsed.host,
      path: parsed.pathname, query: parsed.search, hash: parsed.hash,
    };
    return template.replace(/\{(url|encodedUrl|host|path|query|hash|\d+)\}/g, (_, key) => {
      if (/^\d+$/.test(key)) return match[Number(key)] ?? "";
      return values[key];
    });
  }

  function validateAction(action) {
    if (!action || typeof action !== "object") throw new Error("Choose a destination.");
    if (action.type === "default") return;
    if (action.type === "deep_link") {
      if (typeof action.template !== "string" || !/^[a-z][a-z0-9+.-]*:/i.test(action.template)) {
        throw new Error("Enter a deep link template starting with its protocol, such as linear://{host}{path}{query}{hash}.");
      }
      const scheme = action.template.split(":", 1)[0].toLowerCase();
      if (["http", "https", "file", "data", "javascript", "vbscript", "about", "chrome", "resource", "moz-extension", "chrome-extension", "cloe"].includes(scheme)) {
        throw new Error("Use an application protocol for deep links.");
      }
      return;
    }
    if (action.type === "command") {
      if (typeof action.program !== "string" || !action.program.trim() || /[\0\r\n{}]/.test(action.program)) {
        throw new Error("Enter an executable name or absolute path, without placeholders.");
      }
      if (!Array.isArray(action.args) || action.args.some(arg => typeof arg !== "string" || arg.includes("\0"))) {
        throw new Error("Command arguments must be text, one argument per line.");
      }
      return;
    }
    throw new Error("Unknown destination type.");
  }

  function resolveAction(rule, url, match) {
    validateAction(rule.action);
    const action = rule.action;
    if (action.type === "default") return { type: "default" };
    if (action.type === "deep_link") {
      const target = expand(action.template, url, match);
      new URL(target); // A malformed target must not suppress normal navigation.
      return { type: "deep_link", url: target };
    }
    return { type: "command", program: action.program, args: action.args.map(arg => expand(arg, url, match)) };
  }

  function selectAction(rules, url, interceptAll = false) {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP(S) source links are supported.");
    for (const rule of normalizeRules(rules)) {
      let match;
      try { match = new RegExp(rule.pattern).exec(url); } catch { continue; }
      if (match) return resolveAction(rule, url, match);
    }
    if (interceptAll) return { type: "default" };
    throw new Error("No matching rule.");
  }

  globalThis.CloeRules = { normalizeRules, validateAction, resolveAction, selectAction, expand };
})();
