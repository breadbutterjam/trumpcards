import { doc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { db, functions, whenSignedIn } from "../js/firebase-init.js";
import { avatarImgHtml } from "../js/avatars.js";
import { showScreen } from "../js/router.js";

const MIN_PLAYERS_TO_START = 2;

export function init({ roomId }) {
  console.log("table_lobby.init called with roomId:", roomId);
  const unsubscribers = [];
  let latestPlayers = [];
  let seatAngles = [];

  document.getElementById("roomCode").textContent = roomId;

  whenSignedIn().then(() => {
    const unsubPlayers = onSnapshot(
      collection(db, "rooms", roomId, "players"),
      (snapshot) => {
        latestPlayers = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.seatIndex - b.seatIndex);
        layoutSeats(latestPlayers);
      }
    );
    unsubscribers.push(unsubPlayers);

    const unsubRoom = onSnapshot(doc(db, "rooms", roomId), (snap) => {
      const room = snap.data();
      if (!room) return;
      if (room.status === "in_progress") {
        showScreen("your_deck", { roomId });
      }
    });
    unsubscribers.push(unsubRoom);
  });

  function layoutSeats(players) {
    console.log("layoutSeats called with", players.length, "players:", players);
    const tableSurface = document.getElementById("tableSurface");
    tableSurface.querySelectorAll(".seat").forEach((el) => el.remove());
    seatAngles = [];

    players.forEach((player, i) => {
      const angleDeg = (360 / players.length) * i;
      seatAngles.push(angleDeg);
      const angleRad = ((angleDeg - 90) * Math.PI) / 180;
      const radiusPct = 42;
      const x = 50 + radiusPct * Math.cos(angleRad);
      const y = 50 + radiusPct * Math.sin(angleRad);

      const seatEl = document.createElement("div");
      seatEl.className = "seat";
      seatEl.style.left = x + "%";
      seatEl.style.top = y + "%";
      seatEl.innerHTML = `${avatarImgHtml(player.avatar, "seat-avatar-img")}<div class="seat-name">${player.name}</div>`;
      tableSurface.appendChild(seatEl);
    });

    document.getElementById("startBtn").disabled = players.length < MIN_PLAYERS_TO_START;
  }

  document.getElementById("startBtn").addEventListener("click", async () => {
    const btn = document.getElementById("startBtn");
    if (btn.disabled) return;
    btn.style.display = "none";
    document.getElementById("statusBar").textContent = "Selecting first chooser…";

    const arrow = document.getElementById("arrowWrap");
    arrow.classList.add("visible");
    document.getElementById("tableCenterDot").classList.add("visible");

    const dealInitialHands = httpsCallable(functions, "dealInitialHands");
    try {
      const result = await dealInitialHands({ roomId });
      const firstChooserId = result.data.firstChooser;

      const winnerIndex = latestPlayers.findIndex((p) => p.id === firstChooserId);
      const targetAngle = winnerIndex >= 0 ? seatAngles[winnerIndex] : 0;
      const extraSpins = 4 * 360;
      const finalRotation = extraSpins + targetAngle;

      arrow.style.transition = "transform 3.2s cubic-bezier(.17,.67,.32,1)";
      arrow.style.transform = `translate(-50%, -100%) rotate(${finalRotation}deg)`;

      setTimeout(() => {
        const winnerName = winnerIndex >= 0 ? latestPlayers[winnerIndex].name : "Someone";
        const announceBar = document.getElementById("announceBar");
        announceBar.textContent = `${winnerName} will choose first!`;
        announceBar.classList.add("show");
        document.getElementById("statusBar").textContent = "Waiting to start game…";
        document.getElementById("startGameSection").classList.add("show");
      }, 3300);
    } catch (err) {
      document.getElementById("statusBar").textContent = "Couldn't start: " + err.message;
      btn.style.display = "block";
    }
  });

  document.getElementById("startGameBtn").addEventListener("click", () => {
    showScreen("your_deck", { roomId });
  });

  document.getElementById("copyBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(roomId).then(() => {
      const btn = document.getElementById("copyBtn");
      btn.innerHTML = '<i class="fa-solid fa-check"></i>';
      btn.classList.add("copied");
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
        btn.classList.remove("copied");
      }, 1500);
    });
  });

  document.getElementById("exploreLink").addEventListener("click", () => {
    alert("Explore mode not yet built in this scaffold.");
  });

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}