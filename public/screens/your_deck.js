import { doc, collection, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { db, functions, whenSignedIn } from "../js/firebase-init.js";
import { renderAvatarRow } from "../js/avatar-row.js";
import { showScreen } from "../js/router.js";

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

function cardBackgroundCss(imageValue) {
  const isGradient = /^(linear|radial)-gradient\(/.test(imageValue.trim());
  return isGradient ? imageValue : `url('${imageValue}')`;
}

export function init({ roomId }) {
  const unsubscribers = [];
  let myUid = null;
  let isChooser = false;
  let roomMode = "online";
  let isJudge = false;
  let revealedForRound = null;
  let selectedStatKey = null;
  let selectedDirection = null;
  let currentTopCardId = null;
  let currentRoundNumber = null;
  let myDeckOrder = null;
  let resultPopupShownForRound = null;
  let gameOverPopupShown = false;
  let activeResultPopup = null;
  let latestActivePlayers = [];
  let judgePlayersListenerAdded = false;

  whenSignedIn().then(async (user) => {
    myUid = user.uid;

    const unsubAvatars = renderAvatarRow(roomId, document.getElementById("avatarRow"), {});
    unsubscribers.push(unsubAvatars);

    const unsubRoom = onSnapshot(doc(db, "rooms", roomId), async (snap) => {
      const room = snap.data();
      if (!room) return;

      roomMode = room.mode === "offline" ? "offline" : "online";
      isJudge = room.judgePlayerId === myUid;

      if (roomMode === "offline") {
        document.getElementById("statusBar").style.display = "none";
        if (isJudge && !judgePlayersListenerAdded) {
          judgePlayersListenerAdded = true;
          const unsubJudgePlayers = onSnapshot(collection(db, "rooms", roomId, "players"), (playersSnap) => {
            latestActivePlayers = playersSnap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((p) => p.status !== "eliminated");
          });
          unsubscribers.push(unsubJudgePlayers);
        }
      }

      if (room.status === "game_over") {
        if (!gameOverPopupShown) {
          gameOverPopupShown = true;
          showGameOverPopup(room.winnerIds || [], room.winnerNames || []);
        }
        return;
      }

      const roundChanged = room.currentRoundNumber !== currentRoundNumber;
      const previousRoundNumber = currentRoundNumber;
      currentRoundNumber = room.currentRoundNumber;
      isChooser = room.chooserPlayerId === myUid;

      if (!CATEGORY_DATA) {
        await loadCategoryData(room.category);
      }

      if (roundChanged) {
        if (previousRoundNumber && resultPopupShownForRound !== previousRoundNumber) {
          resultPopupShownForRound = previousRoundNumber;
          if (room.lastRoundWinnerId) {
            await showRoundResultPopup(room.lastRoundWinnerId, room.lastRoundWinnerName);
          }
        }

        myDeckOrder = null;
        selectedStatKey = null;
        selectedDirection = null;
        resetDeckUI();
      }

      if (roomMode === "online") {
        updateStatusBar();
      }

      if (revealedForRound !== currentRoundNumber) {
        await maybeShowDeck();
      }
    });
    unsubscribers.push(unsubRoom);
  });

  function showGameOverPopup(winnerIds, winnerNames) {
    const iWon = winnerIds.includes(myUid);
    const winnerName = winnerNames && winnerNames[0] ? winnerNames[0] : "Someone";

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:60; padding:24px;";
    overlay.innerHTML = `
      <div class="glass-popup" style="width:100%; max-width:320px; text-align:center;">
        <div style="padding:22px 20px 18px;">
          <div style="font-size:13px; font-weight:700; color:var(--crown-gold); margin-bottom:6px;">
            ${iWon ? "🏆 GAME OVER" : "GAME OVER"}
          </div>
          <div style="font-size:17px; font-weight:800; color:#000;">
            ${iWon ? "You won the game!" : `${winnerName} won the game!`}
          </div>
        </div>
        <div style="height:1px; background:rgba(255,255,255,0.25);"></div>
        <button id="gameOverBackBtn" style="width:100%; padding:14px; background:transparent; border:none; color:var(--proceed-text); font-size:15px; font-weight:700; cursor:pointer;">BACK TO TABLE</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("gameOverBackBtn").addEventListener("click", () => {
      overlay.remove();
      showScreen("table_lobby", { roomId });
    });
  }

  function showRoundResultPopup(winnerId, winnerName) {
    return new Promise((resolve) => {
      if (activeResultPopup) {
        activeResultPopup.overlay.remove();
        activeResultPopup.resolve();
        activeResultPopup = null;
      }

      const iWon = winnerId === myUid;

      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:50; padding:24px;";
      overlay.innerHTML = `
        <div class="glass-popup" style="width:100%; max-width:320px; text-align:center;">
          <div style="padding:20px 20px 16px;">
            <div style="font-size:13px; font-weight:700; color:${iWon ? "var(--crown-gold)" : "var(--danger-text)"}; margin-bottom:6px;">
              ${iWon ? "Yohoooo!" : "oh oh"}
            </div>
            <div style="font-size:16px; font-weight:800; color:#000;">
              ${iWon ? "You won" : `You lost, ${winnerName} won`}
            </div>
          </div>
          <div style="height:1px; background:rgba(255,255,255,0.25);"></div>
          <button id="resultContinueBtn" style="width:100%; padding:14px; background:transparent; border:none; color:var(--proceed-text); font-size:15px; font-weight:700; cursor:pointer;">CONTINUE</button>
        </div>
      `;
      document.body.appendChild(overlay);
      activeResultPopup = { overlay, resolve };

      document.getElementById("resultContinueBtn").addEventListener("click", () => {
        overlay.remove();
        activeResultPopup = null;
        resolve();
      });
    });
  }

  function resetDeckUI() {
    const cardArea = document.getElementById("cardArea");
    cardArea.style.display = "flex";
    cardArea.innerHTML = "";
    delete cardArea.dataset.rendered;

    const slot = document.getElementById("revealCardSlot");
    slot.classList.remove("active");
    slot.innerHTML = "";

    document.getElementById("hint").style.display = "block";
    document.getElementById("shuffleBtn").style.display = "none";
  }

  function updateStatusBar() {
    const bar = document.getElementById("statusBar");
    const alreadyRevealed = revealedForRound === currentRoundNumber;
    if (isChooser) {
      bar.textContent = alreadyRevealed
        ? "Pick a category and High / Low"
        : "Your turn: tap your deck to reveal your card";
    } else {
      bar.textContent = "Waiting for the chooser to pick a category…";
    }
  }

  async function maybeShowDeck() {
    const cardArea = document.getElementById("cardArea");
    if (cardArea.dataset.rendered === String(currentRoundNumber)) return;
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

    // if (roomMode === "offline" || isChooser) {
      document.getElementById("shuffleBtn").style.display = "flex";
    // }

    document.getElementById("topCard").addEventListener("click", revealTopCard);
    document.getElementById("topCard").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); revealTopCard(); }
    });
  }

  async function fetchMyDeck() {
    const deckRef = doc(db, "rooms", roomId, "players", myUid, "private", "deck");
    const snap = await getDoc(deckRef);
    return snap.data().cardOrder;
  }

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

    document.getElementById("hint").style.display = "none";
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

    if (roomMode === "offline") {
      renderOfflineCard(card);
    } else if (isChooser) {
      renderChooserCard(card);
    } else {
      renderReadOnlyCard(card, true);
      updateStatusBar();
    }
  }

  function showEliminatedState() {
    const slot = document.getElementById("revealCardSlot");
    slot.classList.add("active");
    slot.innerHTML = `
      <div class="reveal-card" style="background-image:linear-gradient(160deg, #2a2820, #17160f);">
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
    if (roomMode === "online") {
      document.getElementById("statusBar").textContent = "You're out of cards — spectating.";
    }
  }

  function renderOfflineCard(card) {
    const slot = document.getElementById("revealCardSlot");
    const statsHtml = Object.values(card.stats).map((s) => `
      <div class="stat-cell readonly">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.display}</div>
      </div>
    `).join("");

    slot.innerHTML = `
      <div class="reveal-card" style="background-image:${cardBackgroundCss(card.images[0])};">
        <div class="reveal-gradient"></div>

        <div class="reveal-stats"><div class="reveal-region">${card.region}</div>${statsHtml}</div>
      </div>
    `;

    if (isJudge) {
      renderJudgePanel();
    }
  }

  // FIX: tapping a chip now opens a confirmation popup directly — no more
  // separate "select then confirm" two-step. The header text also doubles
  // as the judge's role/instruction message, since offline mode has no
  // status bar to put it in.
  function renderJudgePanel() {
    const revealCard = document.querySelector(".reveal-card");
    const panel = document.createElement("div");
    panel.className = "glass-popup judge-panel";
    panel.style.cssText = "position:absolute; left:6%; right:6%; top:8%; padding:14px; z-index:7;";
    panel.innerHTML = `
      <div style="font-size:12px; font-weight:700; color:#fff; margin-bottom:8px; text-align:center;">
        You're the judge — tap on the winner to proceed to next round.
      </div>
      <div id="judgePlayerChips" style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;"></div>
    `;
    revealCard.appendChild(panel);

    const chipsEl = document.getElementById("judgePlayerChips");
    chipsEl.innerHTML = latestActivePlayers.map((p) => `
      <button class="judge-chip" data-player-id="${p.id}" data-player-name="${p.name}" type="button" style="padding:8px 12px; border-radius:999px; border:2px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.1); color:#fff; font-size:12px; font-weight:700; cursor:pointer;">
        ${p.name}
      </button>
    `).join("");

    chipsEl.querySelectorAll(".judge-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        showOfflineConfirmPopup(chip.dataset.playerId, chip.dataset.playerName);
      });
    });
  }

  function showOfflineConfirmPopup(winnerId, winnerName) {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:55; padding:24px;";
    overlay.innerHTML = `
      <div class="glass-popup" style="width:100%; max-width:320px;">
        <div style="padding:18px 20px 14px; text-align:center;">
          <div style="font-size:13px; color:rgba(255,255,255,0.85); margin-bottom:4px;">Confirm winner</div>
          <div style="font-size:16px; font-weight:800; color:#fff;">${winnerName} won this round?</div>
        </div>
        <div style="height:1px; background:rgba(255,255,255,0.25);"></div>
        <div style="display:flex;">
          <button id="offlineCancelBtn" style="flex:1; padding:14px; background:transparent; border:none; border-right:1px solid rgba(255,255,255,0.25); color:var(--danger-text); font-size:15px; font-weight:700; cursor:pointer;">CANCEL</button>
          <button id="offlineYesBtn" style="flex:1; padding:14px; background:transparent; border:none; color:var(--proceed-text); font-size:15px; font-weight:700; cursor:pointer;">YES</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("offlineCancelBtn").addEventListener("click", () => {
      overlay.remove();
    });

    document.getElementById("offlineYesBtn").addEventListener("click", async () => {
      const yesBtn = document.getElementById("offlineYesBtn");
      yesBtn.disabled = true;
      yesBtn.textContent = "…";
      try {
        const resolveOfflineModeRound = httpsCallable(functions, "resolveOfflineModeRound");
        await resolveOfflineModeRound({ roomId, winnerId });
        overlay.remove();
        // Round transition (result popup, next deck) arrives via the room
        // listener, same as online mode.
      } catch (err) {
        overlay.remove();
        alert("Couldn't confirm: " + err.message);
      }
    });
  }

  function renderReadOnlyCard(card, showWaitingBanner) {
    const slot = document.getElementById("revealCardSlot");
    const statsHtml = Object.values(card.stats).map((s) => `
      <div class="stat-cell readonly">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.display}</div>
      </div>
    `).join("");

    slot.innerHTML = `
      <div class="reveal-card" style="background-image:${cardBackgroundCss(card.images[0])};">
        <div class="reveal-gradient"></div>
        
        <div class="reveal-stats"><div class="reveal-region">${card.region}</div>${statsHtml}</div>
        ${showWaitingBanner ? '<div class="waiting-banner">Waiting for the chooser to pick a category…</div>' : ""}
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
      <div class="reveal-card" style="background-image:${cardBackgroundCss(card.images[0])};">
        <div class="reveal-gradient"></div>        
        <div class="direction-toggle" id="directionToggle">
          <button class="direction-btn" id="dirHigh">High</button>
          <button class="direction-btn" id="dirLow">Low</button>
        </div>
        <div class="reveal-stats" id="revealStats"><div class="reveal-region">${card.region}</div>${statsHtml}</div>
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
    document.getElementById("btnConfirm").addEventListener("click", () => confirmSelection());
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

  async function confirmSelection() {
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
      if (result.data.status === "game_over") {
        document.getElementById("statusBar").textContent = "Game over!";
      } else {
        document.getElementById("statusBar").textContent =
          result.data.status === "tied"
            ? "It's a tie! Breakout round needed (not yet built)."
            : "Round resolved! Waiting for the next round to load…";
      }
    } catch (err) {
      document.getElementById("statusBar").textContent = "Error: " + err.message;
    }
  }

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}
