import { renderFullCardHtml } from "./cards.js";

/**
 * Opens a full-screen "browse all cards" overlay for the given category
 * data. Opens directly on a random card (not a list) — swipe or Prev/Next
 * to cycle through (wraps around at either end), with a list icon in the
 * header to jump straight to a specific card by name.
 *
 * @param {{ categoryName?: string, cards: object[] }} categoryData
 */
export function openExploreOverlay(categoryData) {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed; inset:0; z-index:70; display:flex; flex-direction:column; background:var(--surface-1);";
  document.body.appendChild(overlay);

  let currentIndex = Math.floor(Math.random() * categoryData.cards.length);
  let touchStartX = null;
  const SWIPE_THRESHOLD = 50;

  function goNext() {
    renderCardView((currentIndex + 1) % categoryData.cards.length);
  }
  function goPrev() {
    renderCardView((currentIndex - 1 + categoryData.cards.length) % categoryData.cards.length);
  }

  function attachSwipeHandlers(containerEl) {
    containerEl.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    containerEl.addEventListener("touchend", (e) => {
      if (touchStartX === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
      if (deltaX < 0) {
        goNext();
      } else {
        goPrev();
      }
    }, { passive: true });
  }

  function renderCardView(index) {
    currentIndex = index;
    const card = categoryData.cards[index];

    overlay.innerHTML = `
      <div style="background:#fff; color:#1a1a1a; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
        <button id="exploreListBtn" aria-label="View card list" style="background:none; border:none; width:30px; height:30px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#1a1a1a;">
          <i class="fa-solid fa-list"></i>
        </button>
        <div style="font-weight:700; font-size:14px;">${index + 1} of ${categoryData.cards.length}</div>
        <button id="exploreCloseBtn" aria-label="Close" style="width:30px; height:30px; border-radius:50%; background:rgba(0,0,0,0.08); border:none; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div id="exploreCardContent" style="flex:1; min-height:0; position:relative;">
        ${renderFullCardHtml(card)}
      </div>
      <div style="display:flex; flex-shrink:0; border-top:1px solid var(--border);">
        <button id="explorePrevBtn" style="flex:1; padding:14px; background:var(--surface-2); border:none; color:var(--text-primary); font-weight:700; font-size:13px; cursor:pointer;">← PREV</button>
        <button id="exploreNextBtn" style="flex:1; padding:14px; background:var(--surface-2); border:none; border-left:1px solid var(--border); color:var(--text-primary); font-weight:700; font-size:13px; cursor:pointer;">NEXT →</button>
      </div>
    `;

    document.getElementById("exploreListBtn").addEventListener("click", renderListView);
    document.getElementById("exploreCloseBtn").addEventListener("click", () => overlay.remove());
    document.getElementById("explorePrevBtn").addEventListener("click", goPrev);
    document.getElementById("exploreNextBtn").addEventListener("click", goNext);
    attachSwipeHandlers(document.getElementById("exploreCardContent"));
  }

  function renderListView() {
    overlay.innerHTML = `
      <div style="background:#fff; color:#1a1a1a; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
        <button id="exploreBackBtn" aria-label="Back to card" style="background:none; border:none; display:flex; align-items:center; gap:6px; font-weight:700; font-size:14px; color:#1a1a1a; cursor:pointer;">
          <i class="fa-solid fa-chevron-left"></i> Back
        </button>
        <button id="exploreCloseBtn2" aria-label="Close" style="width:30px; height:30px; border-radius:50%; background:rgba(0,0,0,0.08); border:none; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div style="flex:1; overflow-y:auto; padding:8px 0;">
        ${categoryData.cards.map((c, i) => `
          <button class="explore-list-item" data-index="${i}" style="width:100%; text-align:left; padding:14px 18px; background:none; border:none; border-bottom:1px solid var(--border); color:var(--text-primary); font-size:15px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:space-between;">
            <span>${c.region}</span>
            <i class="fa-solid fa-chevron-right" style="color:var(--text-muted); font-size:12px;" aria-hidden="true"></i>
          </button>
        `).join("")}
      </div>
    `;

    overlay.querySelectorAll(".explore-list-item").forEach((btn) => {
      btn.addEventListener("click", () => renderCardView(parseInt(btn.dataset.index, 10)));
    });
    document.getElementById("exploreBackBtn").addEventListener("click", () => renderCardView(currentIndex));
    document.getElementById("exploreCloseBtn2").addEventListener("click", () => overlay.remove());
  }

  renderCardView(currentIndex);
}
