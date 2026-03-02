const STORAGE_KEY = "urlPatterns";
const INTERCEPT_ALL_KEY = "interceptAll";

const interceptAllCheckbox = document.getElementById("intercept-all");
const patternsSection = document.getElementById("patterns-section");
const patternInput = document.getElementById("new-pattern");
const addBtn = document.getElementById("add-btn");
const inputError = document.getElementById("input-error");
const patternList = document.getElementById("pattern-list");
const emptyState = document.getElementById("empty-state");
const presetSelect = document.getElementById("preset-select");
const presetAddBtn = document.getElementById("preset-add-btn");

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
  return data[STORAGE_KEY];
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

// ── Toggle ─────────────────────────────────────────────────────

function applyInterceptAllState(enabled) {
  interceptAllCheckbox.checked = enabled;

  if (enabled) {
    patternsSection.classList.add("disabled");
    patternInput.disabled = true;
    addBtn.disabled = true;
    presetSelect.disabled = true;
    presetAddBtn.disabled = true;
  } else {
    patternsSection.classList.remove("disabled");
    patternInput.disabled = false;
    addBtn.disabled = false;
    presetSelect.disabled = false;
    presetAddBtn.disabled = !presetSelect.value;
  }
}

async function toggleInterceptAll() {
  const enabled = interceptAllCheckbox.checked;
  await saveInterceptAll(enabled);
  applyInterceptAllState(enabled);
}

// ── Rendering ──────────────────────────────────────────────────

function renderPresets(patterns) {
  presetSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Quick add a preset\u2026";
  presetSelect.appendChild(placeholder);

  const available = PRESETS.filter((p) => !patterns.includes(p.pattern));

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

  patterns.forEach((pattern, index) => {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.className = "pattern-text";
    span.textContent = pattern;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removePattern(index));

    li.appendChild(span);
    li.appendChild(removeBtn);
    patternList.appendChild(li);
  });

  renderPresets(patterns);
}

// ── Actions ────────────────────────────────────────────────────

async function addPatternRaw(raw) {
  clearError();

  if (!raw) {
    showError("Pattern cannot be empty.");
    return;
  }

  if (!isValidRegex(raw)) {
    showError("Invalid regular expression.");
    return;
  }

  const patterns = await loadPatterns();

  if (patterns.includes(raw)) {
    showError("This pattern already exists.");
    return;
  }

  patterns.push(raw);
  await savePatterns(patterns);
  renderPatterns(patterns);
}

async function addPattern() {
  const raw = patternInput.value.trim();
  await addPatternRaw(raw);
  patternInput.value = "";
  patternInput.focus();
}

async function addPreset() {
  const value = presetSelect.value;
  if (!value) return;
  await addPatternRaw(value);
}

async function removePattern(index) {
  const patterns = await loadPatterns();
  patterns.splice(index, 1);
  await savePatterns(patterns);
  renderPatterns(patterns);
}

// ── Init ───────────────────────────────────────────────────────

interceptAllCheckbox.addEventListener("change", toggleInterceptAll);

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

Promise.all([loadInterceptAll(), loadPatterns()]).then(([allEnabled, patterns]) => {
  applyInterceptAllState(allEnabled);
  renderPatterns(patterns);
});
