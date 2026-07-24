import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { db, functions, whenSignedIn } from "../js/firebase-init.js";
import { renderAvatarRow } from "../js/avatar-row.js";
import { showScreen } from "../js/router.js";

// Static category data — needed client-side to show labels/values for the
// cards you already own. Duplicated from functions/data (see README).
let CATEGORY_DATA = null;
async function loadCategoryData(categoryId) {
  if (!CATEGORY_DATA) {
    CATEGORY_DATA = await fetch(`data/${categoryId}.json`).then((r) => r.json());
  }
  return CATEGORY_DATA;
}
function cardById(id) {
  return CATEGORY_DATA.cards.find((c) => c.id === id);
}

// Card images may currently be CSS gradient placeholders (e.g.
// "linear-gradient(...)") or, once real assets exist, actual image URLs.
// This lets both work without needing to touch this code again when real
// photos are swapped in.
function cardBackgroundCss(imageValue) {
  const isGradient = /^(linear|radial)-gradient\(/.test(imageValue.trim());
  return isGradient ? imageValue : `url('${imageValue}')`;
}

export function init({ roomId }) {
  const unsubscribers = [];
  let myUid = null;
  let isChooser = false;
  let revealedForRound = null; // tracks WHICH round we've revealed for, not just yes/no
  let selectedStatKey = null;
  let selectedDirection = null;
  let currentTopCardId = null;
  let currentRoundNumber = null;
  let myDeckOrder = null; // cached per-round; must be invalidated when the round changes

  whenSignedIn().then(async (user) => {
    myUid = user.uid;

    const unsubAvatars = renderAvatarRow(roomId, document.getElementById("avatarRow"), {});
    unsubscribers.push(unsubAvatars);

    const unsubRoom = onSnapshot(doc(db, "rooms", roomId), async (snap) => {
      const room = snap.data();
      if (!room) return;

      const roundChanged = room.currentRoundNumber !== currentRoundNumber;
      currentRoundNumber = room.currentRoundNumber;
      isChooser = room.chooserPlayerId === myUid;

      if (!CATEGORY_DATA) {
        await loadCategoryData(room.category);
      }

      if (roundChanged) {
        // A new round started (either the very first one, or the previous
        // round just resolved). Our old cached deck order and reveal state
        // are stale — reset so this round's top card gets fetched fresh.
        myDeckOrder = null;
        selectedStatKey = null;
        selectedDirection = null;
        resetDeckUI();
      }

      updateStatusBar(room);

      if (revealedForRound !== currentRoundNumber) {
        await maybeShowDeck(room);
      }
    });
    unsubscribers.push(unsubRoom);
  });

  function resetDeckUI() {
    const cardArea = document.getElementById("cardArea");
    cardArea.style.display = "flex";
    cardArea.innerHTML = "";
    delete cardArea.dataset.rendered;

    const slot = document.getElementById("revealCardSlot");
    slot.classList.remove("active");
    slot.innerHTML = "";

    document.getElementById("hint").style.opacity = "1";
    document.getElementById("shuffleBtn").style.display = "none";
  }

  function updateStatusBar(room) {
    const bar = document.getElementById("statusBar");
    if (room.status === "game_over") {
      bar.textContent = "Game over!";
      return;
    }
    const alreadyRevealed = revealedForRound === currentRoundNumber;
    if (isChooser) {
      bar.textContent = alreadyRevealed
        ? "Pick a category and High / Low"
        : "Your turn: tap your deck to reveal your card";
    } else {
      bar.textContent = "Waiting for the chooser to pick a category…";
    }
  }

  async function maybeShowDeck(room) {
    const cardArea = document.getElementById("cardArea");
    if (cardArea.dataset.rendered === String(currentRoundNumber)) return; // already showing this round
    cardArea.dataset.rendered = String(currentRoundNumber);

    cardArea.innerHTML = `
      <div class="deck-stack" id="deckStack">
        <div class="deck-card card-back-design back-3"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></div>
        <div class="deck-card card-back-design back-2"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></div>
        <div class="deck-card card-back-design back-1 top-card" id="topCard" tabindex="0" role="button" aria-label="Tap to reveal your top card">
          <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
        </div>
      </div>
    `;
    document.getElementById("hint").textContent = "Shuffle if you like, then tap your deck to reveal your card.";

    if (isChooser) {
      document.getElementById("shuffleBtn").style.display = "flex";
    }

    document.getElementById("topCard").addEventListener("click", revealTopCard);
    document.getElementById("topCard").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); revealTopCard(); }
    });
  }

  // Reads the gated private deck document. This is the one document in the
  // whole system our security rules restrict to only the owning player —
  // this call is the real, live test that those rules work as intended.
  async function fetchMyDeck() {
    const deckRef = doc(db, "rooms", roomId, "players", myUid, "private", "deck");
    const snap = await getDoc(deckRef);
    return snap.data().cardOrder;
  }

  // Client-side-only shuffle for now — reorders the array we already fetched
  // in memory, does not write back to Firestore. Known simplification: a
  // fully honest implementation would shuffle server-side via a Cloud
  // Function, so a player can't repeatedly shuffle+peek to see multiple
  // upcoming cards before committing. Fine for MVP trust levels, worth
  // revisiting before a public launch.

  document.getElementById("shuffleBtn").addEventListener("click", async () => {
    if (revealedForRound === currentRoundNumber) return;
    if (!myDeckOrder) myDeckOrder = await fetchMyDeck();
    for (let i = myDeckOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [myDeckOrder[i], myDeckOrder[j]] = [myDeckOrder[j], myDeckOrder[i]];
    }
    const backCards = document.querySelectorAll(".back-1, .back-2, .back-3");
    backCards.forEach((el) => {
      el.style.transition = "transform 90ms ease";
      el.style.transform = `translate(${Math.random() * 10 - 5}px, ${Math.random() * 10 - 5}px) rotate(${Math.random() * 10 - 5}deg)`;
    });
    setTimeout(() => {
      backCards.forEach((el) => { el.style.transform = ""; });
    }, 300);
  });

  async function revealTopCard() {
    if (revealedForRound === currentRoundNumber) return;
    revealedForRound = currentRoundNumber;
    document.getElementById("hint").style.opacity = "0";
    document.getElementById("shuffleBtn").style.display = "none";
    document.getElementById("cardArea").style.display = "none";

    if (!myDeckOrder) myDeckOrder = await fetchMyDeck();

    if (myDeckOrder.length === 0) {
      showEliminatedState();
      return;
    }

    currentTopCardId = myDeckOrder[0];
    const card = cardById(currentTopCardId);

    const slot = document.getElementById("revealCardSlot");
    slot.classList.add("active");

    if (isChooser) {
      renderChooserCard(card);
    } else {
      renderReadOnlyCard(card);
    }

    updateStatusBar({ status: "in_progress" });
  }

  function showEliminatedState() {
    const slot = document.getElementById("revealCardSlot");
    slot.classList.add("active");
    slot.innerHTML = `
      <div class="reveal-card" style="background:linear-gradient(160deg, #2a2820, #17160f);">
        <div class="glass-popup" style="position:absolute; left:8%; right:8%; top:40%; text-align:center; padding:22px 18px;">
          <div style="font-size:16px; font-weight:800; color:var(--crown-gold); margin-bottom:8px;">
            You're out of cards!
          </div>
          <div style="font-size:13px; color:#fff; margin-bottom:16px;">
            You can head back to the table and spectate, or browse the cards while the others finish.
          </div>
          <button class="btn-candy btn-green" id="backToTableBtn">BACK TO TABLE</button>
        </div>
      </div>
    `;
    document.getElementById("backToTableBtn").addEventListener("click", () => {
      showScreen("table_lobby", { roomId });
    });
    document.getElementById("statusBar").textContent = "You're out of cards — spectating.";
  }

  function renderReadOnlyCard(card) {
    const slot = document.getElementById("revealCardSlot");
    const statsHtml = Object.values(card.stats).map((s) => `
      <div class="stat-cell readonly">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.display}</div>
      </div>
    `).join("");

    slot.innerHTML = `
      <div class="reveal-card" style="background:${cardBackgroundCss(card.images[0])};">
        <div class="reveal-gradient"></div>
        <div class="reveal-region">${card.region}</div>
        <div class="reveal-stats">${statsHtml}</div>
        <div class="waiting-banner">Waiting for the chooser to pick a category…</div>
      </div>
    `;
  }

  function renderChooserCard(card) {
    const slot = document.getElementById("revealCardSlot");
    const statEntries = Object.entries(card.stats);
    const statsHtml = statEntries.map(([key, s], i) => `
      <div class="stat-cell" data-key="${key}" data-index="${i}">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.display}</div>
      </div>
    `).join("");

    slot.innerHTML = `
      <div class="reveal-card" style="background:${cardBackgroundCss(card.images[0])};">
        <div class="reveal-gradient"></div>
        <div class="reveal-region">${card.region}</div>
        <div class="direction-toggle" id="directionToggle">
          <button class="direction-btn" id="dirHigh">High</button>
          <button class="direction-btn" id="dirLow">Low</button>
        </div>
        <div class="reveal-stats" id="revealStats">${statsHtml}</div>
        <div class="confirm-popup glass-popup" id="confirmPopup">
          <div class="confirm-popup-text">
            <div class="confirm-popup-label">Continue with</div>
            <div class="confirm-popup-value" id="popupValue"></div>
          </div>
          <div class="confirm-popup-divider"></div>
          <div class="confirm-popup-actions">
            <button class="btn-cancel-popup" id="btnCancel">CANCEL</button>
            <button class="btn-yes-popup" id="btnConfirm">YES</button>
          </div>
        </div>
      </div>
    `;

    const statsEl = document.getElementById("revealStats");
    statsEl.querySelectorAll(".stat-cell").forEach((el) => {
      el.addEventListener("click", () => selectStat(el.dataset.key, el));
    });
    document.getElementById("dirHigh").addEventListener("click", () => selectDirection("High"));
    document.getElementById("dirLow").addEventListener("click", () => selectDirection("Low"));
    document.getElementById("btnCancel").addEventListener("click", resetSelection);
    document.getElementById("btnConfirm").addEventListener("click", () => confirmSelection(card));
    document.querySelector(".reveal-card").addEventListener("click", handleCardBackgroundClick);
  }

  function selectStat(key, cellEl) {
    if (document.getElementById("revealStats").classList.contains("locked")) return;
    selectedStatKey = key;
    document.querySelectorAll(".stat-cell").forEach((el) => el.classList.remove("selected"));
    cellEl.classList.add("selected");

    const toggle = document.getElementById("directionToggle");
    toggle.classList.add("show");
    const cardRect = document.querySelector(".reveal-card").getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    let top = cellRect.top - cardRect.top - toggleRect.height - 6;
    let left = cellRect.left - cardRect.left + cellRect.width / 2 - toggleRect.width / 2;
    left = Math.max(8, Math.min(left, cardRect.width - toggleRect.width - 8));
    toggle.style.top = top + "px";
    toggle.style.left = left + "px";
  }

  function selectDirection(dir) {
    selectedDirection = dir;
    document.getElementById("dirHigh").classList.toggle("active", dir === "High");
    document.getElementById("dirLow").classList.toggle("active", dir === "Low");

    const card = cardById(currentTopCardId);
    const stat = card.stats[selectedStatKey];
    document.getElementById("popupValue").textContent = `${stat.label}: ${stat.display} | ${dir}`;
    document.getElementById("confirmPopup").classList.add("show");

    document.querySelectorAll(".stat-cell").forEach((el) => el.classList.remove("selected"));
    document.getElementById("directionToggle").classList.remove("show");
  }

  function resetSelection() {
    selectedStatKey = null;
    selectedDirection = null;
    document.querySelectorAll(".stat-cell").forEach((el) => el.classList.remove("selected"));
    document.getElementById("directionToggle").classList.remove("show");
    document.getElementById("dirHigh").classList.remove("active");
    document.getElementById("dirLow").classList.remove("active");
    document.getElementById("confirmPopup").classList.remove("show");
  }

  function handleCardBackgroundClick(e) {
    if (!selectedStatKey) return;
    if (e.target.closest(".stat-cell, .direction-toggle, .confirm-popup")) return;
    resetSelection();
  }

  async function confirmSelection(card) {
    document.getElementById("confirmPopup").classList.remove("show");
    document.getElementById("revealStats").classList.add("locked");
    document.getElementById("directionToggle").style.pointerEvents = "none";

    const confirmFn = httpsCallable(functions, "confirmSelectionAndResolveRound");
    try {
      const result = await confirmFn({
        roomId,
        statKey: selectedStatKey,
        direction: selectedDirection,
      });
      document.getElementById("statusBar").textContent =
        result.data.status === "tied"
          ? "It's a tie! Breakout round needed (not yet built)."
          : "Round resolved! Waiting for the next round to load…";
    } catch (err) {
      document.getElementById("statusBar").textContent = "Error: " + err.message;
    }
  }

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}
