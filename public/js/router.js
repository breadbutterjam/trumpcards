// Minimal single-shell router. Each "screen" is an HTML fragment (just the
// markup that goes inside #app-root) plus a matching JS module exporting
// `init(params)` and, optionally, `teardown()`. Switching screens fetches
// the new fragment, swaps it in, and runs teardown on whatever the previous
// screen registered (Firestore listeners, timers, etc.) so nothing leaks
// across navigation — important since this is one continuous page, not a
// series of full reloads.

let currentTeardown = null;

export async function showScreen(screenName, params = {}) {
  if (currentTeardown) {
    currentTeardown();
    currentTeardown = null;
  }

  const root = document.getElementById("app-root");
  const html = await fetch(`screens/${screenName}.html`).then((r) => r.text());
  root.innerHTML = html;

  const module = await import(`../screens/${screenName}.js`);
  const result = module.init(params);
  if (typeof result === "function") {
    currentTeardown = result;
  }
}

// Entry point. In a fuller build this would check the URL / a stored room
// code to decide where to resume; for now it always starts at the table
// screen with a hardcoded demo room, matching how we've been testing the
// HTML prototypes.
// showScreen("table_lobby", { roomId: "DEMO01" });
showScreen("entry");
