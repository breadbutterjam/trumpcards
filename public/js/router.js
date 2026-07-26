// Minimal single-shell router. Each "screen" is an HTML fragment (just the
// markup that goes inside #app-root) plus a matching JS module exporting
// `init(params)` and, optionally, `teardown()`.

let currentTeardown = null;
let navigationToken = 0; // guards against two overlapping showScreen calls both fully initializing

export async function showScreen(screenName, params = {}) {
  const myToken = ++navigationToken;

  if (currentTeardown) {
    currentTeardown();
    currentTeardown = null;
  }

  const root = document.getElementById("app-root");
  const html = await fetch(`screens/${screenName}.html`).then((r) => r.text());

  // If a NEWER navigation started while we were fetching, abandon this one
  // — this is what prevents two independent screen instances (each with
  // their own listeners/state) both fully initializing when two code paths
  // race to call showScreen for the same or overlapping transitions.
  if (myToken !== navigationToken) return;

  root.innerHTML = html;

  const module = await import(`../screens/${screenName}.js`);

  if (myToken !== navigationToken) return;

  const result = module.init(params);
  if (typeof result === "function") {
    currentTeardown = result;
  }
}

showScreen("entry");
