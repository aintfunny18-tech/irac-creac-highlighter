// Sentence diagnostics: hover tooltip (pointer devices) and the click/tap
// detail panel with the label-correction chips. Both render the same
// explanation content, sourced from the engine's rule explanations.

import { RULE_EXPLANATIONS } from "../engine/rules.js";
import { LABEL_ORDER } from "../engine/lexicon.js";
import { state } from "./state.js";
import { el } from "./render.js";
import { applyCorrection } from "./corrections.js";

// Explanations for labels assigned by secondary passes rather than a rule.
const PASS_EXPLANATIONS = {
  "pass.context-smoothing":
    "The neighboring sentences on both sides are doing the same structural work, so this sentence was grouped with them.",
  "pass.cascade":
    "It follows an explicit section label (Rule:, Analysis:, Conclusion:), so it inherits that section's role.",
  "pass.final-conclusion":
    "It closes the paragraph with an outcome assertion after rule and application work — the conclusion position.",
  "pass.standalone-citation":
    "A standalone citation supports the sentence before it, so it shares that sentence's role.",
  "pass.explanation-continuation":
    "It continues the case illustration begun in the previous sentence.",
  heading:
    "This looks like a heading or numbering fragment rather than a sentence doing IRAC/CREAC work, so it is left unhighlighted.",
  unclassified:
    "No clear structural signal was detected. That can be fine for transitions — but if this sentence is doing IRAC/CREAC work, make its role explicit.",
};

function explanationFor(sent) {
  if (sent.corrected) {
    return `You set this label manually (the tool originally said ${String(
      sent.original_label || ""
    ).toLowerCase()}).`;
  }
  return (
    PASS_EXPLANATIONS[sent.rule_id] ||
    RULE_EXPLANATIONS[sent.rule_id] ||
    ""
  );
}

function getSentence(target) {
  const paraIdx = Number(target.dataset.paraIndex);
  const sentIdx = Number(target.dataset.sentIndex);
  const sent = state.results?.paragraphs?.[paraIdx]?.sentences?.[sentIdx];
  return { paraIdx, sentIdx, sent };
}

function addSection(container, titleText, rows) {
  const cleanRows = rows.filter(Boolean);
  if (!cleanRows.length) return;
  const section = el("div", "detail-section");
  section.appendChild(el("div", "detail-section-title", titleText));
  for (const row of cleanRows) {
    section.appendChild(el("div", "detail-line", row));
  }
  container.appendChild(section);
}

function buildDiagnosticContent(container, sent, { exactConfidence }) {
  const confPct = Math.round((sent.confidence || 0) * 100);
  let titleText = sent.label;
  titleText += exactConfidence
    ? ` · ${confPct}% ${sent.confidence_label} confidence`
    : ` · ${sent.confidence_label} confidence`;
  if (sent.blend) titleText += " · blend warning";
  if (sent.counterargument) titleText += " · opposing position";
  if (sent.corrected) titleText += " · edited";
  container.appendChild(el("div", "detail-title", titleText));

  const why = explanationFor(sent);
  addSection(container, "Why this label", [
    why,
    sent.trigger_phrase && !sent.trigger_phrase.startsWith("[")
      ? `Matched: “${sent.trigger_phrase.trim()}”`
      : "",
  ]);

  const competing = (sent.competing_labels || []).map(
    (item) => `${item.label} (signal strength ${item.score})`
  );
  addSection(container, "Other plausible labels", competing);

  if (sent.uncertainty_reason) {
    addSection(container, "Why confidence is not higher", [sent.uncertainty_reason]);
  }
  if (sent.revision_hint) {
    addSection(container, "What to check next", [sent.revision_hint]);
  }
}

// ---------------------------------------------------------------- tooltip

let tooltipEl;

export function initTooltip(resultsContainer) {
  tooltipEl = document.getElementById("tooltip");
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  resultsContainer.addEventListener("mouseover", (e) => {
    const target = e.target.closest(".sent");
    if (!target) return;
    const { sent } = getSentence(target);
    if (!sent) return;
    tooltipEl.replaceChildren();
    buildDiagnosticContent(tooltipEl, sent, { exactConfidence: false });
    tooltipEl.appendChild(
      el("div", "detail-section detail-line", "Click the sentence for details and corrections.")
    );
    tooltipEl.classList.add("visible");
    positionTooltip(e);
  });

  resultsContainer.addEventListener("mouseout", (e) => {
    if (e.target.closest(".sent")) tooltipEl.classList.remove("visible");
  });

  resultsContainer.addEventListener("mousemove", positionTooltip);
}

function positionTooltip(e) {
  if (!tooltipEl.classList.contains("visible")) return;
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  const rect = tooltipEl.getBoundingClientRect();
  if (x + rect.width > innerWidth - 8) x = e.clientX - rect.width - pad;
  if (y + rect.height > innerHeight - 8) y = e.clientY - rect.height - pad;
  tooltipEl.style.left = `${Math.max(8, x)}px`;
  tooltipEl.style.top = `${Math.max(8, y)}px`;
}

// ------------------------------------------------------------ detail panel

export function initDetailPanel(resultsContainer) {
  resultsContainer.addEventListener("click", (e) => {
    const target = e.target.closest(".sent");
    if (!target) return;
    toggleDetail(target);
  });

  resultsContainer.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target.closest(".sent");
    if (!target) return;
    e.preventDefault();
    toggleDetail(target);
  });
}

function toggleDetail(target) {
  const { paraIdx, sentIdx, sent } = getSentence(target);
  if (!sent) return;

  const block = target.closest(".para-block");
  const existing = block.querySelector(".sentence-detail");
  const alreadyOpen = target.classList.contains("detail-open");

  block.querySelectorAll(".sent.detail-open").forEach((s) => {
    s.classList.remove("detail-open");
    s.setAttribute("aria-expanded", "false");
  });
  if (existing) existing.remove();
  if (alreadyOpen) return;

  target.classList.add("detail-open");
  target.setAttribute("aria-expanded", "true");

  const panel = el("section", "sentence-detail");
  panel.setAttribute("aria-label", "Sentence details");
  buildDiagnosticContent(panel, sent, { exactConfidence: true });

  // Correction chips
  const section = el("div", "detail-section");
  section.appendChild(el("div", "detail-section-title", "Disagree? Set the label yourself"));
  const row = el("div", "correction-row");
  for (const label of LABEL_ORDER) {
    const btn = el("button", `label-chip-btn chip-${label}`, label);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(sent.label === label));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyCorrection(paraIdx, sentIdx, label);
    });
    row.appendChild(btn);
  }
  section.appendChild(row);
  panel.appendChild(section);

  target.closest(".para-body").insertAdjacentElement("afterend", panel);
}
