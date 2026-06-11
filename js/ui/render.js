// Results rendering: paragraph blocks, sentence spans, summary bar.
// Renders from state.results; corrections are already applied to that object
// by ui/corrections.js, so re-rendering a paragraph is always state → DOM.

import { state } from "./state.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badgeClass(badge) {
  if (!badge) return "badge-info";
  if (badge.startsWith("COMPLETE")) return "badge-complete";
  if (badge.startsWith("WARNING")) return "badge-warning";
  return "badge-info";
}

function shouldFocusPara(para) {
  const hasWarning = typeof para.badge === "string" && para.badge.startsWith("WARNING");
  const lowSentence = (para.sentences || []).some(
    (sent) => sent.confidence_label === "low" || sent.blend
  );
  const warningPriority = (para.revision_priorities || []).some(
    (item) => item.severity === "warning"
  );
  return hasWarning || lowSentence || warningPriority;
}

export function buildParaBlock(para) {
  const block = el("article", "para-block");
  block.dataset.paraIndex = String(para.paragraph_index);
  block.classList.toggle("needs-focus", shouldFocusPara(para));

  // Header: badge, framework, score
  const header = el("div", "para-header");
  header.appendChild(el("span", `badge ${badgeClass(para.badge)}`, para.badge_label));
  if (para.effective_framework) {
    header.appendChild(el("span", "detected-format", `Detected: ${para.effective_framework}`));
  }
  if (typeof para.structure_score === "number") {
    header.appendChild(el("span", "score-chip", `Structure ${para.structure_score}/100`));
  }
  block.appendChild(header);

  if (para.suggestion) {
    block.appendChild(el("div", "suggestion-banner", para.suggestion));
  }
  if (para.cross_para_note) {
    block.appendChild(el("div", "cross-para-note", `↕ ${para.cross_para_note}`));
  }

  // Coaching panel
  const priorities = Array.isArray(para.revision_priorities) ? para.revision_priorities : [];
  if (para.training_summary || priorities.length) {
    const panel = el("section", "coaching-panel");
    if (para.training_summary) {
      panel.appendChild(el("p", "training-summary", para.training_summary));
    }
    if (priorities.length) {
      const list = el("ul", "priority-list");
      for (const item of priorities) {
        const li = el("li", `priority priority-${item.severity || "info"}`);
        li.appendChild(el("strong", "", item.title || item.kind || "Revision priority"));
        if (item.detail) li.appendChild(document.createTextNode(` ${item.detail}`));
        list.appendChild(li);
      }
      panel.appendChild(list);
    }
    block.appendChild(panel);
  }

  // Body: sentence spans
  const body = el("div", "para-body");
  (para.sentences || []).forEach((sent, i) => {
    body.appendChild(buildSentenceSpan(para, sent, i));
    if (i < para.sentences.length - 1) body.appendChild(document.createTextNode(" "));
  });
  block.appendChild(body);

  return block;
}

function buildSentenceSpan(para, sent, sentIdx) {
  const confClass = sent.confidence_label ? ` conf-${sent.confidence_label}` : "";
  const span = el(
    "span",
    `sent sent-${sent.label}${sent.blend ? " blend" : ""}${confClass}`
  );
  span.textContent = sent.text;
  span.tabIndex = 0;
  span.setAttribute("role", "button");
  span.setAttribute("aria-expanded", "false");
  span.setAttribute(
    "aria-label",
    `${sent.text} — classified as ${sent.label.toLowerCase()}, ${sent.confidence_label} confidence. Press Enter for details.`
  );
  span.dataset.paraIndex = String(para.paragraph_index);
  span.dataset.sentIndex = String(sentIdx);
  if (sent.corrected) {
    const mark = el("sup", "corrected-mark", "✎");
    mark.title = "Label set manually";
    span.appendChild(mark);
  }
  return span;
}

export function renderResults() {
  const container = document.getElementById("results-container");
  container.replaceChildren();
  const paras = state.results?.paragraphs || [];
  if (!paras.length) {
    const empty = el("div", "empty-state");
    empty.append(el("span", "empty-icon", "⚖️"), el("span", "", "No paragraphs were detected."));
    container.appendChild(empty);
    return;
  }
  for (const para of paras) {
    container.appendChild(buildParaBlock(para));
  }
  renderSummary();
}

/** Re-render a single paragraph block in place (used after corrections). */
export function rerenderParagraph(paraIdx) {
  const container = document.getElementById("results-container");
  const old = container.querySelector(`.para-block[data-para-index="${paraIdx}"]`);
  const para = state.results.paragraphs[paraIdx];
  if (!old || !para) return;
  old.replaceWith(buildParaBlock(para));
}

export function renderSummary() {
  const summary = state.results?.summary;
  const bar = document.getElementById("summary-bar");
  if (!summary) {
    bar.classList.remove("visible");
    return;
  }
  bar.classList.add("visible");
  document.getElementById("stat-paras").textContent = summary.total_paragraphs;
  document.getElementById("stat-complete").textContent = summary.complete_paragraphs;
  document.getElementById("stat-warnings").textContent = summary.warning_paragraphs;
  document.getElementById("stat-sents").textContent = summary.total_sentences;
  document.getElementById("stat-blends").textContent = summary.blend_count;

  const resetBtn = document.getElementById("btn-reset-corrections");
  const count = state.corrections.size;
  resetBtn.hidden = count === 0;
  document.getElementById("corrections-count").textContent = String(count);
}
