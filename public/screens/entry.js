import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions, whenSignedIn } from "../js/firebase-init.js";
import { AVATARS, avatarImgHtml } from "../js/avatars.js";
import { showScreen } from "../js/router.js";

export function init() {
  let selectedAvatarId = null;

  const nameInput = document.getElementById("nameInput");
  const roomCodeInput = document.getElementById("roomCodeInput");
  const createBtn = document.getElementById("createRoomBtn");
  const joinBtn = document.getElementById("joinRoomBtn");
  const errorText = document.getElementById("errorText");
  const statusBar = document.getElementById("statusBar");

  const grid = document.getElementById("avatarGrid");
  grid.innerHTML = AVATARS.map((a) => `
    <button class="avatar-option" data-avatar-id="${a.id}" aria-label="${a.label}" type="button">
      ${avatarImgHtml(a.id)}
    </button>
  `).join("");

  grid.querySelectorAll(".avatar-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedAvatarId = btn.dataset.avatarId;
      grid.querySelectorAll(".avatar-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      updateButtonStates();
    });
  });

  function getName() {
    return nameInput.value.trim();
  }

  function updateButtonStates() {
    const hasName = getName().length > 0;
    const hasAvatar = !!selectedAvatarId;
    const hasRoomCode = roomCodeInput.value.trim().length === 6;

    createBtn.disabled = !(hasName && hasAvatar);
    joinBtn.disabled = !(hasName && hasAvatar && hasRoomCode);
  }

  nameInput.addEventListener("input", updateButtonStates);
  roomCodeInput.addEventListener("input", () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase();
    updateButtonStates();
  });

  whenSignedIn().then(() => {
    statusBar.textContent = "Enter your details to get started.";
  });

  createBtn.addEventListener("click", () => {
    if (createBtn.disabled) return;
    showScreen("create_room", { playerName: getName(), avatarId: selectedAvatarId });
  });

  joinBtn.addEventListener("click", async () => {
    if (joinBtn.disabled) return;
    errorText.textContent = "";
    joinBtn.disabled = true;
    joinBtn.textContent = "JOINING…";

    try {
      const joinRoom = httpsCallable(functions, "joinRoom");
      const result = await joinRoom({
        roomCode: roomCodeInput.value.trim(),
        playerName: getName(),
        avatar: selectedAvatarId,
      });
      showScreen("table_lobby", { roomId: result.data.roomId });
    } catch (err) {
      errorText.textContent = err.message || "Couldn't join that room.";
      joinBtn.disabled = false;
      joinBtn.textContent = "JOIN ROOM";
    }
  });
}
