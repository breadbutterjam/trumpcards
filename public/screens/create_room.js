import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from "../js/firebase-init.js";
import { showScreen } from "../js/router.js";

export function init({ playerName, avatarId }) {
  const startBtn = document.getElementById("startGameConfigBtn");
  const backBtn = document.getElementById("backBtn");
  const errorText = document.getElementById("errorText");

  // Guard: this screen only makes sense arriving from the entry screen with
  // a name+avatar already chosen. If someone lands here directly (e.g. a
  // stale bookmark/refresh in a fuller future build), send them back rather
  // than let them create a room with missing player details.
  if (!playerName || !avatarId) {
    showScreen("entry");
    return;
  }

  backBtn.addEventListener("click", () => {
    showScreen("entry");
  });

  startBtn.addEventListener("click", async () => {
    errorText.textContent = "";
    startBtn.disabled = true;
    startBtn.textContent = "CREATING…";

    try {
      const createRoom = httpsCallable(functions, "createRoom");
      // Category is intentionally not sent — the server currently always
      // assigns the one real category that exists (states_of_india). Once
      // more categories are added, this screen becomes a genuine picker
      // and would pass the chosen categoryId through here.
      const result = await createRoom({
        playerName,
        avatar: avatarId,
        maxPlayers: 6,
      });
      showScreen("table_lobby", { roomId: result.data.roomId });
    } catch (err) {
      errorText.textContent = err.message || "Couldn't create the room.";
      startBtn.disabled = false;
      startBtn.textContent = "CREATE ROOM & GO TO LOBBY";
    }
  });
}
