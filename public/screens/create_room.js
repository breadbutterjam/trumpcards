import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from "../js/firebase-init.js";
import { showScreen } from "../js/router.js";

const CATEGORIES = [
  {
    id: "states_of_india",
    name: "States of India",
    sub: "Area, population, formed-on dates, and more",
    gradient: "linear-gradient(160deg, #f0c896, #b97a4d)",
  },
  // {
  //   id: "mountains",
  //   name: "Famous Mountains",
  //   sub: "Height, first ascent, range, and more",
  //   gradient: "linear-gradient(160deg, #cfe8fa, #7b93a3)",
  // },
  {
    id: "cricketers",
    name: "Cricketers",
    sub: "Batting, bowling, and fielding stats",
    gradient: "linear-gradient(160deg, #f0e8fa, #4227f3)",
  },
  {
    id: "iplcricketers",
    name: "IPL Cricketers",
    sub: "IPL Legends - Batting, bowling, and fielding stats",
    gradient: "linear-gradient(160deg, #f0e8fa, #7b4da3)",
  },
];

export function init({ playerName, avatarId }) {
  const startBtn = document.getElementById("startGameConfigBtn");
  const backBtn = document.getElementById("backBtn");
  const errorText = document.getElementById("errorText");
  const categoryList = document.getElementById("categoryList");
  const modeToggle = document.getElementById("modeToggle");

  if (!playerName || !avatarId) {
    showScreen("entry");
    return;
  }

  let selectedCategoryId = CATEGORIES[0].id;
  let selectedMode = "online";

  modeToggle.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedMode = btn.dataset.mode;
      modeToggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  categoryList.innerHTML = CATEGORIES.map((cat, i) => `
    <div class="category-card${i === 0 ? " selected" : ""}" data-category-id="${cat.id}"
         style="background:${cat.gradient};" tabindex="0" role="button" aria-label="${cat.name}">
      <div class="category-check"><i class="fa-solid fa-check"></i></div>
      <div class="category-name">${cat.name}</div>
      <div class="category-sub">${cat.sub}</div>
    </div>
  `).join("");

  categoryList.querySelectorAll(".category-card").forEach((cardEl) => {
    const select = () => {
      selectedCategoryId = cardEl.dataset.categoryId;
      categoryList.querySelectorAll(".category-card").forEach((el) => el.classList.remove("selected"));
      cardEl.classList.add("selected");
    };
    cardEl.addEventListener("click", select);
    cardEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
    });
  });

  backBtn.addEventListener("click", () => {
    showScreen("entry");
  });

  startBtn.addEventListener("click", async () => {
    errorText.textContent = "";
    startBtn.disabled = true;
    startBtn.textContent = "CREATING…";

    try {
      const createRoom = httpsCallable(functions, "createRoom");
      const result = await createRoom({
        playerName,
        avatar: avatarId,
        maxPlayers: 6,
        categoryId: selectedCategoryId,
        mode: selectedMode,
      });
      showScreen("table_lobby", { roomId: result.data.roomId });
    } catch (err) {
      errorText.textContent = err.message || "Couldn't create the room.";
      startBtn.disabled = false;
      startBtn.textContent = "CREATE ROOM & GO TO LOBBY";
    }
  });
}
