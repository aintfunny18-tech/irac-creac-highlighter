// App entry point: wires inputs, analysis, legend, theme, examples, export.
// All analysis runs locally in the browser — there is no server.

import { classifyText } from "./engine/classify.js";
import { MAX_PASTE_BYTES, MAX_UPLOAD_BYTES } from "./engine/lexicon.js";
import { parsePlaintext } from "./parse/text.js";
import { EXAMPLES } from "../examples/examples.js";
import { state, resetAnalysisState } from "./ui/state.js";
import { renderResults, el } from "./ui/render.js";
import { initTooltip, initDetailPanel } from "./ui/detail.js";
import { resetCorrections } from "./ui/corrections.js";
import { showError, showWarning, clearMessages } from "./ui/messages.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- tabs

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const selected = btn.dataset.tab === tab;
    btn.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".tab-content").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });
  clearMessages();
}

function registerFileDropZone(dropId, fileInput) {
  const zone = $(dropId);
  for (const eventName of ["dragenter", "dragover"]) {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.add("drag-active");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    zone.addEventListener(eventName, (e) => {
      e.preventDefault();
      zone.classList.remove("drag-active");
    });
  }
  zone.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    fileInput.files = files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// ---------------------------------------------------------------- analyze

async function getInputParagraphs() {
  if (state.activeTab === "paste") {
    const text = $("paste-input").value.trim();
    if (!text) {
      throw new Error("No text was provided. Please paste text or upload a file.");
    }
    if (new TextEncoder().encode(text).length > MAX_PASTE_BYTES) {
      throw new Error("Pasted text is too large (limit 50 KB). Try a section at a time.");
    }
    state.sourceDescription = "Pasted text";
    return parsePlaintext(text);
  }

  const fileInput = state.activeTab === "docx" ? $("docx-file-input") : $("pdf-file-input");
  const file = fileInput.files[0];
  if (!file) {
    throw new Error("No file selected. Please choose a file to upload.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File is too large (limit 10 MB).");
  }
  state.sourceDescription = file.name;

  if (state.activeTab === "docx") {
    const { parseDocx } = await import("./parse/docx-in.js");
    return parseDocx(file);
  }
  const { parsePdf } = await import("./parse/pdf-in.js");
  return parsePdf(file);
}

async function runAnalysis() {
  clearMessages();
  const btn = $("btn-analyze");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Analyzing…';
  try {
    const { paragraphs, warnings } = await getInputParagraphs();
    if (warnings?.length) showWarning(warnings.join(" "));
    if (!paragraphs.length) {
      if (!warnings?.length) showError("No readable text was found in the input.");
      return;
    }

    state.corrections.clear();
    state.results = classifyText(paragraphs, "AUTO");
    renderResults();

    $("btn-export").disabled = false;
    $("btn-print").disabled = false;
    $("collapsed-source").textContent = `Analyzed: ${state.sourceDescription}`;
    if (matchMedia("(max-width: 899px)").matches) {
      document.body.classList.add("input-collapsed");
      $("results-container").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (err) {
    showError(err.message || "Something went wrong while analyzing.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze";
  }
}

function clearAll() {
  $("paste-input").value = "";
  $("docx-file-input").value = "";
  $("pdf-file-input").value = "";
  $("docx-filename").textContent = "";
  $("pdf-filename").textContent = "";
  resetAnalysisState();
  document.body.classList.remove("input-collapsed");
  $("btn-export").disabled = true;
  $("btn-print").disabled = true;
  $("summary-bar").classList.remove("visible");
  $("toggle-focus").checked = false;
  $("results-container").classList.remove("focus-only");
  state.focusOnly = false;
  clearMessages();

  const container = $("results-container");
  container.replaceChildren();
  const empty = el("div", "empty-state");
  empty.id = "empty-state";
  empty.append(el("span", "empty-icon", "⚖️"));
  const span = el("span");
  span.innerHTML = "Paste or upload a legal draft, then press <strong>Analyze</strong>.";
  empty.append(span);
  const actions = el("span", "empty-actions");
  for (const [key, label] of [["memo", "Try an office memo"], ["exam", "Try an exam answer"]]) {
    const btn = el("button", "btn btn-sm", label);
    btn.dataset.example = key;
    actions.append(btn);
  }
  empty.append(actions);
  container.appendChild(empty);
}

// ---------------------------------------------------------------- examples

function loadExample(key) {
  const example = EXAMPLES[key];
  if (!example) return;
  switchTab("paste");
  document.body.classList.remove("input-collapsed");
  $("paste-input").value = example.text;
  runAnalysis();
}

// ---------------------------------------------------------------- export

async function runExport() {
  if (!state.results) return;
  const btn = $("btn-export");
  btn.disabled = true;
  try {
    const { exportDocx } = await import("./export/docx-out.js");
    await exportDocx(state.results, state.corrections.size);
  } catch (err) {
    showError(`Export failed: ${err.message}. You can use Print → Save as PDF instead.`);
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------- theme

function initTheme() {
  $("btn-theme").addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next === "dark" ? "dark" : "";
    if (next !== "dark") delete root.dataset.theme;
    try {
      localStorage.setItem("lwsc-theme", next);
    } catch (e) { /* private mode */ }
  });
}

// ---------------------------------------------------------------- init

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("docx-file-input").addEventListener("change", () => {
    $("docx-filename").textContent = $("docx-file-input").files[0]?.name || "";
  });
  $("pdf-file-input").addEventListener("change", () => {
    $("pdf-filename").textContent = $("pdf-file-input").files[0]?.name || "";
  });
  registerFileDropZone("docx-drop", $("docx-file-input"));
  registerFileDropZone("pdf-drop", $("pdf-file-input"));

  $("btn-analyze").addEventListener("click", runAnalysis);
  $("btn-clear").addEventListener("click", clearAll);
  $("btn-export").addEventListener("click", runExport);
  $("btn-print").addEventListener("click", () => window.print());
  $("btn-reset-corrections").addEventListener("click", resetCorrections);
  $("btn-edit-input").addEventListener("click", () => {
    document.body.classList.remove("input-collapsed");
  });

  $("btn-example-memo").addEventListener("click", () => loadExample("memo"));
  $("btn-example-exam").addEventListener("click", () => loadExample("exam"));
  document.addEventListener("click", (e) => {
    const exampleBtn = e.target.closest("[data-example]");
    if (exampleBtn) loadExample(exampleBtn.dataset.example);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!$("btn-analyze").disabled) runAnalysis();
    }
  });

  // Legend toggles
  document
    .querySelectorAll('.results-toolbar input[type="checkbox"][data-label]')
    .forEach((cb) => {
      cb.addEventListener("change", () => {
        const container = $("results-container");
        container.classList.toggle(`hide-${cb.dataset.label}`, !cb.checked);
      });
    });
  $("toggle-focus").addEventListener("change", (e) => {
    state.focusOnly = e.target.checked;
    $("results-container").classList.toggle("focus-only", state.focusOnly);
  });

  const resultsContainer = $("results-container");
  initTooltip(resultsContainer);
  initDetailPanel(resultsContainer);
  initTheme();

  // Register the service worker for offline support (no-op during local dev
  // on file:// or when unsupported).
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
});
