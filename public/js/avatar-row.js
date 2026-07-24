import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { avatarImgHtml } from "./avatars.js";

const SEAT_COLORS = [
  { bg: "var(--success-bg)", text: "var(--success-text)", border: "var(--success-border)" },
  { bg: "var(--pro-bg)", text: "var(--pro-text)", border: "var(--pro-border)" },
  { bg: "var(--warning-bg)", text: "var(--warning-text)", border: "var(--warning-border)" },
];

function statusBadgeHtml(status) {
  if (status === "ready") {
    return '<div class="status-badge ready"><i class="fa-solid fa-check"></i></div>';
  }
  if (status === "deciding") {
    return '<div class="status-badge deciding"><i class="fa-solid fa-hourglass-half"></i></div>';
  }
  return ""; // eliminated/spectator players get no ready/deciding badge
}

/**
 * Subscribes to `rooms/{roomId}/players` and keeps `containerEl` in sync live.
 * Returns an unsubscribe function — call it when navigating away from a screen.
 *
 * @param {string} roomId
 * @param {HTMLElement} containerEl
 * @param {{ leaderIds?: string[] }} [options] - which player IDs get a crown
 */
export function renderAvatarRow(roomId, containerEl, options = {}) {
  const playersRef = collection(db, "rooms", roomId, "players");

  return onSnapshot(playersRef, (snapshot) => {
    const players = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.seatIndex - b.seatIndex);

    const leaderIds = options.leaderIds || [];

    containerEl.innerHTML = players.map((p, i) => {
      const color = SEAT_COLORS[i % SEAT_COLORS.length];
      const isLeader = leaderIds.includes(p.id);
      return `
        <div class="avatar-col" data-player-id="${p.id}">
          <div class="avatar-wrap-outer" style="border-radius:50%; border:2px solid ${color.border}; background:${color.bg};">
            ${avatarImgHtml(p.avatar)}
            ${statusBadgeHtml(p.status)}
            ${isLeader ? '<div class="crown-icon" aria-hidden="true"><i class="fa-solid fa-crown"></i></div>' : ""}
          </div>
          <div class="avatar-name">${p.name}</div>
          <div class="avatar-count">${p.cardCount} cards</div>
        </div>
      `;
    }).join("");
  });
}
