/* ============================================================
   Legal Writing Structure Coach — Frontend Logic
   ============================================================ */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentResults = null;   // last successful /analyze response
let activeTab = 'paste';     // 'paste' | 'docx' | 'pdf' | 'rtf'
const hiddenLabels = new Set(); // label names toggled off in legend
let focusOnly = false;       // show only warning / low-confidence paragraphs

// ---------------------------------------------------------------------------
// Element refs (resolved after DOMContentLoaded)
// ---------------------------------------------------------------------------
let tabBtns, pasteInput, docxFileInput, pdfFileInput, rtfFileInput;
let docxFilename, pdfFilename, rtfFilename;
let btnAnalyze, btnClear, btnExport;
let msgError, msgWarning;
let resultsContainer, emptyState, summaryBar, toggleFocus;
let tooltip;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  tabBtns        = document.querySelectorAll('.tab-btn');
  pasteInput     = document.getElementById('paste-input');
  docxFileInput  = document.getElementById('docx-file-input');
  pdfFileInput   = document.getElementById('pdf-file-input');
  rtfFileInput   = document.getElementById('rtf-file-input');
  docxFilename   = document.getElementById('docx-filename');
  pdfFilename    = document.getElementById('pdf-filename');
  rtfFilename    = document.getElementById('rtf-filename');
  btnAnalyze     = document.getElementById('btn-analyze');
  btnClear       = document.getElementById('btn-clear');
  btnExport      = document.getElementById('btn-export');
  msgError       = document.getElementById('msg-error');
  msgWarning     = document.getElementById('msg-warning');
  resultsContainer = document.getElementById('results-container');
  emptyState     = document.getElementById('empty-state');
  summaryBar     = document.getElementById('summary-bar');
  toggleFocus    = document.getElementById('toggle-focus');
  tooltip        = document.getElementById('tooltip');

  // Tab switching
  tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // File input labels
  docxFileInput.addEventListener('change', () => {
    docxFilename.textContent = docxFileInput.files[0]?.name || '';
  });
  pdfFileInput.addEventListener('change', () => {
    pdfFilename.textContent = pdfFileInput.files[0]?.name || '';
  });
  rtfFileInput.addEventListener('change', () => {
    rtfFilename.textContent = rtfFileInput.files[0]?.name || '';
  });

  // Buttons
  btnAnalyze.addEventListener('click', runAnalysis);
  btnClear.addEventListener('click', clearAll);
  btnExport.addEventListener('click', runExport);
  document.addEventListener('keydown', onGlobalKeydown);

  // Legend toggles
  document.querySelectorAll('.results-header input[type="checkbox"]').forEach(cb => {
    if (cb.dataset.label) cb.addEventListener('change', () => toggleLabel(cb.dataset.label, cb.checked));
  });
  toggleFocus.addEventListener('change', () => toggleFocusOnly(toggleFocus.checked));

  // Tooltip (event delegation)
  resultsContainer.addEventListener('mouseover', onTooltipShow);
  resultsContainer.addEventListener('mouseout', onTooltipHide);
  resultsContainer.addEventListener('click', onSentenceClick);
  document.addEventListener('mousemove', onTooltipMove);
});

// ---------------------------------------------------------------------------
// Tab management
// ---------------------------------------------------------------------------
function switchTab(tab) {
  activeTab = tab;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tab}`);
  });
  // Clear the other inputs
  if (tab !== 'paste') pasteInput.value = '';
  if (tab !== 'docx') { docxFileInput.value = ''; docxFilename.textContent = ''; }
  if (tab !== 'pdf')  { pdfFileInput.value = '';  pdfFilename.textContent = '';  }
  if (tab !== 'rtf')  { rtfFileInput.value = '';  rtfFilename.textContent = '';  }
  clearMessages();
}

function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!btnAnalyze.disabled) runAnalysis();
  }
}

// ---------------------------------------------------------------------------
// Analyze
// ---------------------------------------------------------------------------
async function runAnalysis() {
  clearMessages();
  const framework = 'AUTO';

  let fetchPromise;

  if (activeTab === 'paste') {
    const text = pasteInput.value.trim();
    if (!text) { showError('No text was provided. Please paste text or upload a file.'); return; }
    fetchPromise = fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, framework }),
    });

  } else {
    const fileInput = getActiveFileInput();
    if (!fileInput.files.length) {
      showError('No file selected. Please choose a file to upload.');
      return;
    }
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('framework', framework);
    fetchPromise = fetch('/analyze', { method: 'POST', body: fd });
  }

  setLoading(true);
  try {
    const res = await fetchPromise;
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'An unexpected error occurred.');
      return;
    }

    if (data.warnings?.length) {
      showWarning(data.warnings.join(' '));
    }

    currentResults = data;
    renderResults(data);
    btnExport.disabled = false;

  } catch (err) {
    showError('Could not reach the server. Is it still running?');
  } finally {
    setLoading(false);
  }
}

function getActiveFileInput() {
  if (activeTab === 'docx') return docxFileInput;
  if (activeTab === 'pdf') return pdfFileInput;
  return rtfFileInput;
}

// ---------------------------------------------------------------------------
// Render results
// ---------------------------------------------------------------------------
function renderResults(data) {
  // Remove all children except the empty-state div
  while (resultsContainer.firstChild) {
    resultsContainer.removeChild(resultsContainer.firstChild);
  }

  const paras = data.paragraphs || [];

  if (!paras.length) {
    resultsContainer.appendChild(buildEmptyState());
    return;
  }

  paras.forEach(para => {
    resultsContainer.appendChild(buildParaBlock(para));
  });

  renderSummary(data.summary);
}

function buildParaBlock(para) {
  const block = el('div', 'para-block');
  block.classList.toggle('needs-focus', shouldFocusPara(para));

  // Header: badge + suggestions
  const header = el('div', 'para-header');

  const badgeClass = getBadgeClass(para.badge);
  const badge = el('span', `badge ${badgeClass}`);
  badge.textContent = para.badge_label;
  header.appendChild(badge);

  if (para.effective_framework) {
    const detected = el('span', 'detected-format');
    detected.textContent = `Detected: ${para.effective_framework}`;
    header.appendChild(detected);
  }

  if (para.suggestion) {
    const details = el('details', 'suggestions');
    const summary = el('summary');
    summary.textContent = 'Suggestions';
    const suggText = el('div', 'suggestion-text');
    suggText.textContent = para.suggestion;
    details.appendChild(summary);
    details.appendChild(suggText);
    header.appendChild(details);
  }

  if (para.cross_para_note) {
    const note = el('div', 'cross-para-note');
    note.textContent = '↕ ' + para.cross_para_note;
    header.appendChild(note);
  }

  block.appendChild(header);

  const coaching = buildCoachingPanel(para);
  if (coaching) block.appendChild(coaching);

  // Body: sentences
  const body = el('div', 'para-body');
  const sents = para.sentences || [];

  sents.forEach((sent, i) => {
    const confClass = sent.confidence_label ? ` conf-${sent.confidence_label}` : '';
    const span = el('span', `sent sent-${sent.label}${sent.blend ? ' blend' : ''}${confClass}`);
    span.textContent = sent.text;
    span.dataset.hasTooltip = 'true';
    span.dataset.label = sent.label || '';
    span.dataset.confidence = typeof sent.confidence === 'number' ? String(Math.round(sent.confidence * 100)) : '';
    span.dataset.confidenceLabel = sent.confidence_label || '';
    span.dataset.trigger = sent.trigger_phrase || '';
    span.dataset.evidence = Array.isArray(sent.evidence) ? sent.evidence.join('|') : '';
    span.dataset.competing = Array.isArray(sent.competing_labels)
      ? sent.competing_labels.map(item => `${item.label}: ${item.score}`).join('|')
      : '';
    span.dataset.uncertainty = sent.uncertainty_reason || '';
    span.dataset.hint = sent.revision_hint || '';
    span.dataset.blend = sent.blend ? 'true' : 'false';
    span.dataset.counterargument = sent.counterargument ? 'true' : 'false';
    body.appendChild(span);
    if (i < sents.length - 1) body.appendChild(document.createTextNode(' '));
  });

  block.appendChild(body);
  return block;
}

function getBadgeClass(badge) {
  if (!badge) return 'badge-info';
  if (badge.startsWith('COMPLETE'))  return 'badge-complete';
  if (badge.startsWith('WARNING'))   return 'badge-warning';
  return 'badge-info';
}

function buildEmptyState() {
  const d = el('div', 'empty-state');
  d.innerHTML = '<span class="empty-icon">⚖️</span><span>No structural markers were detected.</span>';
  return d;
}

function buildCoachingPanel(para) {
  const priorities = Array.isArray(para.revision_priorities) ? para.revision_priorities : [];
  if (!para.training_summary && !priorities.length && typeof para.structure_score !== 'number') return null;

  const panel = el('section', 'coaching-panel');
  const top = el('div', 'coaching-topline');
  const score = el('span', 'score-chip');
  score.textContent = typeof para.structure_score === 'number'
    ? `Structure ${para.structure_score}/100`
    : 'Structure score unavailable';
  top.appendChild(score);

  if (para.training_summary) {
    const summary = el('p', 'training-summary');
    summary.textContent = para.training_summary;
    top.appendChild(summary);
  }
  panel.appendChild(top);

  if (priorities.length) {
    const list = el('ul', 'priority-list');
    priorities.forEach(item => {
      const li = el('li', `priority priority-${item.severity || 'info'}`);
      const title = el('strong');
      title.textContent = item.title || item.kind || 'Revision priority';
      const detail = el('span');
      detail.textContent = item.detail ? ` ${item.detail}` : '';
      li.appendChild(title);
      li.appendChild(detail);
      list.appendChild(li);
    });
    panel.appendChild(list);
  }

  return panel;
}

function shouldFocusPara(para) {
  const hasWarning = typeof para.badge === 'string' && para.badge.startsWith('WARNING');
  const lowSentence = (para.sentences || []).some(sent => sent.confidence_label === 'low' || sent.blend);
  const warningPriority = (para.revision_priorities || []).some(item => item.severity === 'warning');
  return hasWarning || lowSentence || warningPriority;
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------
function renderSummary(summary) {
  if (!summary) return;
  summaryBar.style.display = 'flex';
  document.getElementById('stat-paras').textContent    = summary.total_paragraphs;
  document.getElementById('stat-complete').textContent = summary.complete_paragraphs;
  document.getElementById('stat-warnings').textContent = summary.warning_paragraphs;
  document.getElementById('stat-sents').textContent    = summary.total_sentences;
  document.getElementById('stat-blends').textContent   = summary.blend_count;

  const counts = summary.label_counts || {};
  const parts = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`);
  document.getElementById('stat-label-counts').textContent = parts.join('  ·  ');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
async function runExport() {
  if (!currentResults) return;
  try {
    const res = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentResults),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showError(data.error || 'Export failed.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotated_draft.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Export request failed. Is the server still running?');
  }
}

// ---------------------------------------------------------------------------
// Legend toggles
// ---------------------------------------------------------------------------
function toggleLabel(label, visible) {
  if (visible) {
    hiddenLabels.delete(label);
    resultsContainer.classList.remove(`hide-${label}`);
  } else {
    hiddenLabels.add(label);
    resultsContainer.classList.add(`hide-${label}`);
  }
}

function toggleFocusOnly(visible) {
  focusOnly = visible;
  resultsContainer.classList.toggle('focus-only', focusOnly);
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
let tooltipX = 0, tooltipY = 0;

function onTooltipShow(e) {
  const target = e.target.closest('[data-has-tooltip]');
  if (!target) return;
  buildTooltipContent(target);
  tooltip.classList.add('visible');
}

function onTooltipHide(e) {
  if (!e.target.closest('[data-has-tooltip]')) return;
  tooltip.classList.remove('visible');
}

function onTooltipMove(e) {
  tooltipX = e.clientX;
  tooltipY = e.clientY;
  if (tooltip.classList.contains('visible')) {
    tooltip.style.left = (tooltipX + 14) + 'px';
    tooltip.style.top  = (tooltipY - 28) + 'px';
  }
}

function onSentenceClick(e) {
  const target = e.target.closest('[data-has-tooltip]');
  if (!target) return;

  const block = target.closest('.para-block');
  const existing = block.querySelector('.sentence-detail');
  const alreadyOpen = target.classList.contains('detail-open');

  block.querySelectorAll('.sent.detail-open').forEach(el => el.classList.remove('detail-open'));
  if (existing) existing.remove();

  if (alreadyOpen) return;

  target.classList.add('detail-open');
  const panel = el('section', 'sentence-detail');
  buildDiagnosticContent(panel, target, { includeExactConfidence: true });
  target.closest('.para-body').insertAdjacentElement('afterend', panel);
}

function buildTooltipContent(target) {
  tooltip.replaceChildren();
  buildDiagnosticContent(tooltip, target, { includeExactConfidence: false });
}

function buildDiagnosticContent(container, target, options = {}) {
  const title = el('div', 'tooltip-title');
  const label = target.dataset.label || 'Sentence';
  const confLabel = target.dataset.confidenceLabel || '';
  const conf = options.includeExactConfidence && target.dataset.confidence
    ? ` · ${target.dataset.confidence}% ${confLabel}`
    : (confLabel ? ` · ${confLabel} confidence` : '');
  title.textContent = `${label}${conf}`;
  if (target.dataset.blend === 'true') title.textContent += ' · blend warning';
  if (target.dataset.counterargument === 'true') title.textContent += ' · opposing position';
  container.appendChild(title);

  addDiagnosticSection(container, 'Why this was classified this way', [
    target.dataset.trigger ? `Trigger: ${target.dataset.trigger}` : '',
    ...splitDataset(target.dataset.evidence).map(item => `Evidence: ${item}`),
  ]);

  const competing = splitDataset(target.dataset.competing);
  if (competing.length) {
    addDiagnosticSection(container, 'Other plausible labels', competing);
  }

  if (target.dataset.uncertainty) {
    addDiagnosticSection(container, 'Why confidence is not high', [target.dataset.uncertainty]);
  }

  if (target.dataset.hint) {
    addDiagnosticSection(container, 'What to check next', [target.dataset.hint]);
  }
}

function addDiagnosticSection(container, titleText, rows) {
  const cleanRows = rows.filter(Boolean);
  if (!cleanRows.length) return;
  const section = el('div', 'tooltip-section');
  const title = el('div', 'tooltip-section-title');
  title.textContent = titleText;
  section.appendChild(title);
  cleanRows.forEach(row => {
    const line = el('div', 'tooltip-line');
    line.textContent = row;
    section.appendChild(line);
  });
  container.appendChild(section);
}

function splitDataset(value) {
  return (value || '').split('|').map(v => v.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
function showError(text) {
  msgError.textContent = text;
  msgError.classList.add('visible');
}
function showWarning(text) {
  msgWarning.textContent = text;
  msgWarning.classList.add('visible');
}
function clearMessages() {
  msgError.classList.remove('visible');
  msgWarning.classList.remove('visible');
  msgError.textContent = '';
  msgWarning.textContent = '';
}

// ---------------------------------------------------------------------------
// Clear all
// ---------------------------------------------------------------------------
function clearAll() {
  pasteInput.value = '';
  docxFileInput.value = '';
  pdfFileInput.value = '';
  rtfFileInput.value = '';
  docxFilename.textContent = '';
  pdfFilename.textContent = '';
  rtfFilename.textContent = '';
  currentResults = null;
  focusOnly = false;
  if (toggleFocus) toggleFocus.checked = false;
  btnExport.disabled = true;
  summaryBar.style.display = 'none';
  resultsContainer.classList.remove('focus-only');
  clearMessages();

  while (resultsContainer.firstChild) resultsContainer.removeChild(resultsContainer.firstChild);
  const emptyDiv = el('div', 'empty-state');
  emptyDiv.id = 'empty-state';
  emptyDiv.innerHTML = '<span class="empty-icon">⚖️</span><span>Paste or upload a legal draft, then click <strong>Analyze</strong>.</span>';
  resultsContainer.appendChild(emptyDiv);
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
function setLoading(loading) {
  btnAnalyze.disabled = loading;
  if (loading) {
    btnAnalyze.innerHTML = '<span class="spinner"></span>Analyzing…';
  } else {
    btnAnalyze.textContent = 'Analyze';
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
