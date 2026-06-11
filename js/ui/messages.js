// Inline error / warning messages in the input panel.

const msgError = () => document.getElementById("msg-error");
const msgWarning = () => document.getElementById("msg-warning");

export function showError(text) {
  const el = msgError();
  el.textContent = text;
  el.classList.add("visible");
}

export function showWarning(text) {
  const el = msgWarning();
  el.textContent = text;
  el.classList.add("visible");
}

export function clearMessages() {
  for (const el of [msgError(), msgWarning()]) {
    el.classList.remove("visible");
    el.textContent = "";
  }
}
