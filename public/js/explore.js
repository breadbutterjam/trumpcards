import { renderFullCardHtml } from "./cards.js";

/**
 * Opens a full-screen "browse all cards" overlay for the given category
 * data. Two internal views sharing one overlay element: a plain list of
 * card names, and a full-card view with Prev/Next/Back. Closing (X) at
 * any point just removes the overlay — nothing underneath is affected.
 *
 * @param {{ categoryName?: string, cards: object[] }} categoryData
 */
export function openExploreOverlay(categoryData) {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed; inset:0; z-index:70; display:flex; flex-direction:column; background:var(--surface-1);";
  document.body.appendChild(overlay);

  function renderListView() {
    overlay.innerHTML = `
      <div style="background:#fff; color:#1a1a1a; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
        <div style="font-weight:700; font-size:15px;">${categoryData.categoryName || "Browse cards"}</div>
        <button id="exploreCloseBtn" aria-label="Close" style="width:30px; height:30px; border-radius:50%; background:rgba(0,0,0,0.08); border:none; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
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
    document.getElementById("exploreCloseBtn").addEventListener("click", () => overlay.remove());
  }

  function renderCardView(index) {
    const card = categoryData.cards[index];
    const atStart = index === 0;
    const atEnd = index === categoryData.cards.length - 1;

    overlay.innerHTML = `
      <div style="background:#fff; color:#1a1a1a; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
        <button id="exploreBackBtn" aria-label="Back to list" style="background:none; border:none; display:flex; align-items:center; gap:6px; font-weight:700; font-size:14px; color:#1a1a1a; cursor:pointer;">
          <i class="fa-solid fa-chevron-left"></i> Back
        </button>
        <button id="exploreCloseBtn2" aria-label="Close" style="width:30px; height:30px; border-radius:50%; background:rgba(0,0,0,0.08); border:none; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div style="flex:1; min-height:0; position:relative;">
        ${renderFullCardHtml(card)}
      </div>
      <div style="display:flex; flex-shrink:0; border-top:1px solid var(--border);">
        <button id="explorePrevBtn" ${atStart ? "disabled" : ""} style="flex:1; padding:14px; background:var(--surface-2); border:none; color:${atStart ? "var(--text-muted)" : "var(--text-primary)"}; font-weight:700; font-size:13px; cursor:${atStart ? "not-allowed" : "pointer"};">← PREV</button>
        <button id="exploreNextBtn" ${atEnd ? "disabled" : ""} style="flex:1; padding:14px; background:var(--surface-2); border:none; border-left:1px solid var(--border); color:${atEnd ? "var(--text-muted)" : "var(--text-primary)"}; font-weight:700; font-size:13px; cursor:${atEnd ? "not-allowed" : "pointer"};">NEXT →</button>
      </div>
    `;

    document.getElementById("exploreBackBtn").addEventListener("click", renderListView);
    document.getElementById("exploreCloseBtn2").addEventListener("click", () => overlay.remove());
    if (!atStart) document.getElementById("explorePrevBtn").addEventListener("click", () => renderCardView(index - 1));
    if (!atEnd) document.getElementById("exploreNextBtn").addEventListener("click", () => renderCardView(index + 1));
  }

  renderListView();
}
