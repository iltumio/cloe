const STORAGE_KEY = "urlPatterns";
const INTERCEPT_ALL_KEY = "interceptAll";
const DEBUG_KEY = "debugMode";
const BROWSER_TABS_KEY = "interceptBrowserTabs";
const DEFAULT_BROWSER_TABS = chrome.runtime.getURL("").startsWith("moz-extension://");
let editingIndex = null;
const destinationType = document.getElementById("destination-type");
const deepLinkTemplate = document.getElementById("deep-link-template");
const commandProgram = document.getElementById("command-program");
const commandArgs = document.getElementById("command-args");
const cancelEdit = document.getElementById("cancel-edit");
const browserTabsCheckbox = document.getElementById("intercept-browser-tabs");

const interceptAllCheckbox = document.getElementById("intercept-all");
const patternInput = document.getElementById("new-pattern");
const addBtn = document.getElementById("add-btn");
const inputError = document.getElementById("input-error");
const patternList = document.getElementById("pattern-list");
const emptyState = document.getElementById("empty-state");
const presetSelect = document.getElementById("preset-select");
const presetAddBtn = document.getElementById("preset-add-btn");
const debugCheckbox = document.getElementById("debug-mode");
const nativeStatus = document.getElementById("native-status");
const nativeStatusText = document.getElementById("native-status-text");
const nativeRecheckBtn = document.getElementById("native-recheck");

// ── Presets ─────────────────────────────────────────────────────

const PRESETS = [
  { label: "Google Meet",      pattern: "^https://meet\\.google\\.com/" },
  { label: "Zoom",             pattern: "^https://([a-z0-9]+\\.)?zoom\\.us/" },
  { label: "Microsoft Teams",  pattern: "^https://teams\\.microsoft\\.com/" },
  { label: "Slack",            pattern: "^https://([a-z0-9-]+\\.)?slack\\.com/" },
  { label: "Discord",          pattern: "^https://discord\\.com/" },
  { label: "GitHub",           pattern: "^https://github\\.com/" },
  { label: "Google Calendar",  pattern: "^https://calendar\\.google\\.com/" },
  { label: "YouTube",          pattern: "^https://(www\\.)?youtube\\.com/" },
];

// ── Helpers ────────────────────────────────────────────────────

function isValidRegex(pattern) {
  try {
    new RegExp(pattern);
    return true;
  } catch (_) {
    return false;
  }
}

function showError(msg) {
  inputError.textContent = msg;
  inputError.hidden = false;
}

function clearError() {
  inputError.hidden = true;
}

// ── Storage ────────────────────────────────────────────────────

async function loadPatterns() {
  const data = await chrome.storage.sync.get({ [STORAGE_KEY]: [] });
  return CloeRules.normalizeRules(data[STORAGE_KEY]);
}

async function savePatterns(patterns) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: patterns });
}

async function loadInterceptAll() {
  const data = await chrome.storage.sync.get({ [INTERCEPT_ALL_KEY]: false });
  return data[INTERCEPT_ALL_KEY] === true;
}

async function saveInterceptAll(value) {
  await chrome.storage.sync.set({ [INTERCEPT_ALL_KEY]: value });
}

async function loadDebugMode() {
  const data = await chrome.storage.sync.get({ [DEBUG_KEY]: false });
  return data[DEBUG_KEY] === true;
}

async function saveDebugMode(value) {
  await chrome.storage.sync.set({ [DEBUG_KEY]: value });
}

// ── Toggle ─────────────────────────────────────────────────────

function applyInterceptAllState(enabled) {
  interceptAllCheckbox.checked = enabled;
}

async function toggleInterceptAll() {
  const enabled = interceptAllCheckbox.checked;
  await saveInterceptAll(enabled);
  applyInterceptAllState(enabled);
}

async function toggleDebugMode() {
  await saveDebugMode(debugCheckbox.checked);
}

// ── Rendering ──────────────────────────────────────────────────

function renderPresets(patterns) {
  presetSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Quick add a preset\u2026";
  presetSelect.appendChild(placeholder);

  const available = PRESETS.filter((p) => !patterns.some(rule => rule.pattern === p.pattern));

  available.forEach((preset) => {
    const opt = document.createElement("option");
    opt.value = preset.pattern;
    opt.textContent = `${preset.label}  \u2014  ${preset.pattern}`;
    presetSelect.appendChild(opt);
  });

  presetSelect.disabled = available.length === 0;
  presetAddBtn.disabled = true;
  presetSelect.value = "";
}

function renderPatterns(patterns) {
  patternList.innerHTML = "";
  emptyState.hidden = patterns.length > 0;

  patterns.forEach((rule, index) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "pattern-text";
    const action = rule.action;
    const description = action.type === "deep_link" ? action.template
      : action.type === "command" ? `${action.program} ${(action.args || []).map(arg => JSON.stringify(arg)).join(" ")}`
      : "Default browser";
    span.textContent = `${rule.pattern} → ${description}`;
    li.appendChild(span);
    const controls = document.createElement("div");
    controls.className = "rule-controls";
    for (const [label, handler, disabled] of [
      ["Edit", () => editRule(rule, index), false],
      ["↑", () => moveRule(index, -1), index === 0],
      ["↓", () => moveRule(index, 1), index === patterns.length - 1],
      ["Remove", () => removePattern(index), false],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;
      button.setAttribute("aria-label", `${label} rule ${index + 1}`);
      button.addEventListener("click", handler);
      controls.appendChild(button);
    }
    li.appendChild(controls);
    patternList.appendChild(li);
  });

  renderPresets(patterns);
}

// ── Actions ────────────────────────────────────────────────────

function updateDestinationFields() {
  document.getElementById("deep-link-fields").hidden = destinationType.value !== "deep_link";
  document.getElementById("command-fields").hidden = destinationType.value !== "command";
  document.getElementById("template-help").hidden = destinationType.value === "default";
}

function readAction() {
  if (destinationType.value === "deep_link") return { type: "deep_link", template: deepLinkTemplate.value.trim() };
  if (destinationType.value === "command") return {
    type: "command", program: commandProgram.value.trim(),
    args: commandArgs.value === "" ? [] : commandArgs.value.split("\n"),
  };
  return { type: "default" };
}

function resetEditor() {
  editingIndex = null;
  patternInput.value = "";
  destinationType.value = "default";
  deepLinkTemplate.value = "";
  commandProgram.value = "";
  commandArgs.value = "";
  addBtn.textContent = "Add";
  cancelEdit.hidden = true;
  clearError();
  updateDestinationFields();
}

function editRule(rule, index) {
  editingIndex = index;
  patternInput.value = rule.pattern;
  destinationType.value = rule.action.type;
  deepLinkTemplate.value = rule.action.template || "";
  commandProgram.value = rule.action.program || "";
  commandArgs.value = (rule.action.args || []).join("\n");
  addBtn.textContent = "Save";
  cancelEdit.hidden = false;
  updateDestinationFields();
  patternInput.focus();
}

async function addPatternRaw(raw) {
  clearError();
  try {
    if (!raw) throw new Error("Pattern cannot be empty.");
    if (!isValidRegex(raw)) throw new Error("Invalid regular expression.");
    const action = readAction();
    CloeRules.validateAction(action);
    const patterns = await loadPatterns();
    if (patterns.some((rule, index) => rule.pattern === raw && index !== editingIndex)) {
      throw new Error("This pattern already exists. Edit that rule instead.");
    }
    const rule = { pattern: raw, action };
    if (editingIndex === null) patterns.push(rule);
    else patterns[editingIndex] = rule;
    await savePatterns(patterns);
    resetEditor();
    renderPatterns(patterns);
    return true;
  } catch (error) {
    showError(error.message);
    return false;
  }
}

async function addPattern() {
  if (await addPatternRaw(patternInput.value.trim())) patternInput.focus();
}

async function addPreset() {
  if (presetSelect.value) await addPatternRaw(presetSelect.value);
}

async function removePattern(index) {
  const patterns = await loadPatterns();
  patterns.splice(index, 1);
  await savePatterns(patterns);
  resetEditor();
  renderPatterns(patterns);
}

async function moveRule(index, direction) {
  const patterns = await loadPatterns();
  const next = index + direction;
  if (next < 0 || next >= patterns.length) return;
  [patterns[index], patterns[next]] = [patterns[next], patterns[index]];
  await savePatterns(patterns);
  resetEditor();
  renderPatterns(patterns);
}

destinationType.addEventListener("change", updateDestinationFields);
cancelEdit.addEventListener("click", resetEditor);
for (const [id, args] of [
  ["omarchy-open", ["launch", "webapp", "{url}"]],
  ["omarchy-focus", ["launch", "or", "focus", "webapp", "Linear", "{url}"]],
]) {
  document.getElementById(id).addEventListener("click", () => {
    commandProgram.value = "omarchy";
    commandArgs.value = args.join("\n");
  });
}

// ── Native host check ───────────────────────────────────────────

function setNativeStatus(state, text) {
  nativeStatus.className = "status-bar " + state;
  nativeStatusText.textContent = text;
  nativeRecheckBtn.hidden = state === "checking";
}

function checkNativeHost() {
  setNativeStatus("checking", "Checking native host\u2026");
  chrome.runtime.sendMessage({ type: "PING_NATIVE" }, (response) => {
    if (chrome.runtime.lastError) {
      setNativeStatus("error", `Cannot reach extension background \u2014 ${chrome.runtime.lastError.message}`);
      return;
    }
    if (response && response.reachable) {
      setNativeStatus("ok", "Native host connected.");
    } else {
      const detail = response?.error || "unknown error";
      setNativeStatus("error", `Native host not found \u2014 ${detail}`);
    }
  });
}

nativeRecheckBtn.addEventListener("click", checkNativeHost);

// ── Init ───────────────────────────────────────────────────────

interceptAllCheckbox.addEventListener("change", toggleInterceptAll);
debugCheckbox.addEventListener("change", toggleDebugMode);

addBtn.addEventListener("click", addPattern);

presetSelect.addEventListener("change", () => {
  presetAddBtn.disabled = !presetSelect.value;
});

presetAddBtn.addEventListener("click", addPreset);

patternInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    addPattern();
  }
});

Promise.all([loadInterceptAll(), loadDebugMode(), loadPatterns()]).then(([allEnabled, debugEnabled, patterns]) => {
  applyInterceptAllState(allEnabled);
  debugCheckbox.checked = debugEnabled;
  renderPatterns(patterns);
});

checkNativeHost();

chrome.storage.sync.get({ [BROWSER_TABS_KEY]: DEFAULT_BROWSER_TABS }).then((data) => {
  browserTabsCheckbox.checked = data[BROWSER_TABS_KEY] === true;
});
browserTabsCheckbox.addEventListener("change", () => {
  chrome.storage.sync.set({ [BROWSER_TABS_KEY]: browserTabsCheckbox.checked });
});
