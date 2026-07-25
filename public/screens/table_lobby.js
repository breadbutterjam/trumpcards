import { doc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { db, functions, whenSignedIn } from "../js/firebase-init.js";
import { avatarImgHtml } from "../js/avatars.js";
import { showScreen } from "../js/router.js";

const MIN_PLAYERS_TO_START = 2;
const AUTO_START_DELAY_MS = 1000; //60000; // wait this long silently before showing the countdown ring
const AUTO_START_COUNTDOWN_SECONDS = 5;

export function init({ roomId }) {
  const unsubscribers = [];
  let latestPlayers = [];
  let seatAngles = [];
  let myUid = null;
  let hasPlayedSpin = false; // guards against replaying the spin animation on every snapshot
  let autoStartTimer60 = null;
  let autoStartInterval20 = null;

  document.getElementById("roomCode").textContent = roomId;

  whenSignedIn().then((user) => {
    myUid = user.uid;

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

      if (room.status === "hands_dealt" && !hasPlayedSpin) {
        hasPlayedSpin = true;
        playSpinAndAnnounce(room);
      }

      if (room.status === "in_progress") {
        clearAutoStartTimers();
        showScreen("your_deck", { roomId });
      }
    });
    unsubscribers.push(unsubRoom);
  });

  function layoutSeats(players) {
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

    // Only relevant pre-deal — once hands_dealt/in_progress, this button is
    // already hidden, so harmlessly setting .disabled here is a no-op.
    document.getElementById("startBtn").disabled = players.length < MIN_PLAYERS_TO_START;
  }

  // Fires identically for EVERY player's screen the moment the room's
  // status becomes "hands_dealt" — this is what fixes the old bug where
  // only the clicker ever saw the spin animation.
  function playSpinAndAnnounce(room) {
    document.getElementById("startBtn").style.display = "none";
    document.getElementById("statusBar").textContent = "Selecting first chooser…";

    const arrow = document.getElementById("arrowWrap");
    arrow.classList.add("visible");
    document.getElementById("tableCenterDot").classList.add("visible");

    const winnerIndex = latestPlayers.findIndex((p) => p.id === room.chooserPlayerId);
    const targetAngle = winnerIndex >= 0 ? seatAngles[winnerIndex] : 0;
    const finalRotation = 4 * 360 + targetAngle;

    arrow.style.transition = "transform 3.2s cubic-bezier(.17,.67,.32,1)";
    arrow.style.transform = `translate(-50%, -100%) rotate(${finalRotation}deg)`;

    setTimeout(() => {
      const winnerName = winnerIndex >= 0 ? latestPlayers[winnerIndex].name : "Someone";
      const announceBar = document.getElementById("announceBar");
      announceBar.textContent = `${winnerName} will choose first!`;
      announceBar.classList.add("show");
      document.getElementById("statusBar").textContent = "Waiting to start game…";
      document.getElementById("startGameSection").classList.add("show");

      scheduleAutoStart();
    }, 3300);
  }

  function scheduleAutoStart() {
    autoStartTimer60 = setTimeout(() => {
      const ringWrap = document.getElementById("autoStartRingWrap");
      const ringFill = document.getElementById("autoStartRingFill");
      const ringNumber = document.getElementById("autoStartRingNumber");
      ringWrap.classList.add("show");

      let secondsLeft = AUTO_START_COUNTDOWN_SECONDS;
      ringNumber.textContent = secondsLeft;
      ringFill.style.transition = "none";
      ringFill.style.strokeDashoffset = "106.8";
      void ringFill.getBoundingClientRect();
      ringFill.style.transition = `stroke-dashoffset ${AUTO_START_COUNTDOWN_SECONDS}s linear`;
      ringFill.style.strokeDashoffset = "0";

      autoStartInterval20 = setInterval(() => {
        secondsLeft--;
        ringNumber.textContent = Math.max(secondsLeft, 0);
        if (secondsLeft <= 0) {
          clearInterval(autoStartInterval20);
          acknowledgeStart(); // auto-tap Start Game on this player's behalf
        }
      }, 1000);
    }, AUTO_START_DELAY_MS);
  }

  function clearAutoStartTimers() {
    clearTimeout(autoStartTimer60);
    clearInterval(autoStartInterval20);
  }

  async function acknowledgeStart() {
    const btn = document.getElementById("startGameBtn");
    btn.disabled = true;
    try {
      const acknowledgeGameStart = httpsCallable(functions, "acknowledgeGameStart");
      await acknowledgeGameStart({ roomId });
      // Navigation happens via the room listener reacting to status
      // becoming "in_progress" once everyone's acknowledged — not here.
      document.getElementById("statusBar").textContent = "Waiting for other players to start…";
    } catch (err) {
      document.getElementById("statusBar").textContent = "Couldn't start: " + err.message;
      btn.disabled = false;
    }
  }

  document.getElementById("startBtn").addEventListener("click", async () => {
    const btn = document.getElementById("startBtn");
    if (btn.disabled) return;
    btn.disabled = true;

    try {
      const dealInitialHands = httpsCallable(functions, "dealInitialHands");
      await dealInitialHands({ roomId });
      // UI transition happens via the room listener (playSpinAndAnnounce),
      // uniformly for every player — including this one.
    } catch (err) {
      // If another player's tap won the race, this is expected and
      // harmless — their success already moves everyone forward via the
      // room listener, so just re-enable in case it was a real failure.
      if (!hasPlayedSpin) {
        document.getElementById("statusBar").textContent = "Couldn't start: " + err.message;
        btn.disabled = false;
      }
    }
  });

  document.getElementById("startGameBtn").addEventListener("click", acknowledgeStart);

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
    clearAutoStartTimers();
    unsubscribers.forEach((unsub) => unsub());
  };
}
