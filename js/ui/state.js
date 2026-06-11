// Central UI state. One mutable object; modules read and write through it.

export const state = {
  /** Last analysis result (the engine's classifyText output), or null. */
  results: null,
  /** "paste" | "docx" | "pdf" */
  activeTab: "paste",
  /** Where the analyzed text came from, for the collapsed-input bar. */
  sourceDescription: "",
  /** Map "paraIdx:sentIdx" → { label, originalLabel } for manual overrides. */
  corrections: new Map(),
  /** Labels currently hidden via the legend. */
  hiddenLabels: new Set(),
  focusOnly: false,
};

export function correctionKey(paraIdx, sentIdx) {
  return `${paraIdx}:${sentIdx}`;
}

export function resetAnalysisState() {
  state.results = null;
  state.corrections.clear();
  state.sourceDescription = "";
}
