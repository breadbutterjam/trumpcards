import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { avatarImgHtml } from "./avatars.js";

const SEAT_COLORS = [
  { bg: "var(--success-bg)", text: "var(--success-text)", border: "var(--success-border)" },
  { bg: "var(--pro-bg)", text: "var(--pro-text)", border: "var(--pro-border)" },
  { bg: "var(--warning-bg)", text: "var(--warning-text)", border: "var(--warning-border)" },
];

/**
 * Subscribes to `rooms/{roomId}/players` and keeps `containerEl` in sync live.
 *
 * Returns { unsubscribe, refresh } — call unsubscribe() when navigating away
 * from a screen, and call refresh() whenever something OUTSIDE this
 * module's own players-collection listener changes and needs an immediate
 * re-render (e.g. room.chooserPlayerId, which lives on a totally separate
 * document/listener — without an explicit refresh(), the chooser-dot would
 * only update whenever the players collection *itself* happens to change
 * next, which is a full round later than the actual chooser change).
 *
 * @param {string} roomId
 * @param {HTMLElement} containerEl
 * @param {{ leaderIds?: string[], getChooserId?: () => (string|null), onAvatarClick?: (player: object) => void }} [options]
 */
export function renderAvatarRow(roomId, containerEl, options = {}) {
  const playersRef = collection(db, "rooms", roomId, "players");
  let latestPlayers = [];

  function render() {
    const leaderIds = options.leaderIds || [];
    const chooserId = typeof options.getChooserId === "function" ? options.getChooserId() : null;

    containerEl.innerHTML = latestPlayers.map((p, i) => {
      const color = SEAT_COLORS[i % SEAT_COLORS.length];
      const isLeader = leaderIds.includes(p.id);
      // FIX: was `chooserId.includes(p.id)` — getChooserId() returns a
      // single player id STRING, not an array, so .includes() was doing a
      // substring check rather than an equality check. Worked by
      // coincidence (a string always contains itself), but was wrong.
      const isChooser = chooserId === p.id;

      return `
        <div class="avatar-col" data-player-id="${p.id}">
          <div class="avatar-wrap-outer" style="border-radius:50%; border:2px solid ${color.border}; background:${color.bg};">
            ${avatarImgHtml(p.avatar)}
            ${isLeader ? '<div class="crown-icon" aria-hidden="true"><i class="fa-solid fa-crown"></i></div>' : ""}
            ${isChooser ? '<div class="judge-dot" aria-hidden="true" title="Choosing this round"></div>' : ""}
          </div>
          <div class="avatar-name">${p.name}</div>
          <div class="avatar-count">${p.cardCount}</div>
        </div>
      `;
    }).join("");

    const clickable = typeof options.onAvatarClick === "function";
    if (clickable) {
      containerEl.querySelectorAll(".avatar-col").forEach((el) => {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
          const player = latestPlayers.find((p) => p.id === el.dataset.playerId);
          if (player) options.onAvatarClick(player);
        });
      });
    }
  }

  const unsubscribe = onSnapshot(playersRef, (snapshot) => {
    latestPlayers = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.seatIndex - b.seatIndex);
    render();
  });

  return { unsubscribe, refresh: render };
}
