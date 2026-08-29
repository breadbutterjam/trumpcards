import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from "../js/firebase-init.js";
import { loadCategoryData } from "../js/cards.js";
import { showScreen } from "../js/router.js";

const CATEGORIES = [
  {
    id: "states_of_india",
    name: "States of India",
    sub: "Area, population, formed-on dates, and more",
    gradient: "linear-gradient(160deg, #f0c896, #b97a4d)",
  },
  {
    id: "mountains",
    name: "Famous Mountains",
    sub: "Height, first ascent, range, and more",
    gradient: "linear-gradient(160deg, #cfe8fa, #7b93a3)",
  },
  {
    id: "iplcricketers",
    name: "IPL cricketers",
    sub: "IPL Superstars",
    gradient: "linear-gradient(160deg, #4531f7, #d3d2f9)",
  },
  {
    id: "cricketers",
    name: "Cricketers",
    sub: "Cricket Legends",
    gradient: "linear-gradient(160deg, #4531f7, #d3d2f9)",
  },
];

export function init({ playerName, avatarId }) {
  const startBtn = document.getElementById("startGameConfigBtn");
  const backBtn = document.getElementById("backBtn");
  const errorText = document.getElementById("errorText");
  const categoryList = document.getElementById("categoryList");
  const modeToggle = document.getElementById("modeToggle");
  const statToggleList = document.getElementById("statToggleList");

  if (!playerName || !avatarId) {
    showScreen("entry");
    return;
  }

  let selectedCategoryId = CATEGORIES[0].id;
  let selectedMode = "online";
  let selectedStatKeys = new Set(); // populated once the category's schema loads

  modeToggle.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedMode = btn.dataset.mode;
      modeToggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  let toggleVisibilityElem;
  document.querySelectorAll('.field-label-parent').forEach((labelParent)=>{
    labelParent.addEventListener("click", () =>{
      // clickedLabel = labelParent
      // console.log(labelParent.getAttribute("data"))
      // document.getElementById(temp1.getAttribute("data"))  
      toggleVisibilityElem = document.getElementById(labelParent.getAttribute("data"));
      // console.log(toggleVisibilityElem);
      if (toggleVisibilityElem.style.display === "none"){
        toggleVisibilityElem.style.display = "";
        labelParent.querySelector('.expand-collapse-icons').innerText = "-";
      } else {
        toggleVisibilityElem.style.display = "none";
        labelParent.querySelector('.expand-collapse-icons').innerText = "+";
      }
  
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
      renderStatToggleList(selectedCategoryId);
    };
    cardEl.addEventListener("click", select);
    cardEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
    });
  });

  // Fetches the given category's stat schema and renders one toggle row per
  // property, defaulting to all-selected. Every card in a category shares
  // the same stat keys, so the first card is a reliable source for "what
  // properties exist at all."
  async function renderStatToggleList(categoryId) {
    statToggleList.innerHTML = `<div style="color:var(--text-muted); font-size:13px; padding:8px 4px;">Loading properties…</div>`;

    const categoryData = await loadCategoryData(categoryId);
    const sampleStats = categoryData.cards[0].stats;
    const allKeys = Object.keys(sampleStats);

    selectedStatKeys = new Set(allKeys);

    statToggleList.innerHTML = allKeys.map((key) => `
      <div class="stat-toggle-row selected" data-key="${key}" tabindex="0" role="checkbox" aria-checked="true">
        <span>${sampleStats[key].label}</span>
        <div class="stat-toggle-checkbox"><i class="fa-solid fa-check"></i></div>
      </div>
    `).join("");

    statToggleList.querySelectorAll(".stat-toggle-row").forEach((row) => {
      const toggle = () => {
        const key = row.dataset.key;
        if (selectedStatKeys.has(key)) {
          if (selectedStatKeys.size === 1) return; // keep at least one property selected
          selectedStatKeys.delete(key);
          row.classList.remove("selected");
          row.setAttribute("aria-checked", "false");
        } else {
          selectedStatKeys.add(key);
          row.classList.add("selected");
          row.setAttribute("aria-checked", "true");
        }
      };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
  }

  renderStatToggleList(selectedCategoryId);

  statToggleList.style.display = "none";

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
        // Set built by iterating allKeys in category order and only ever
        // add/delete — iteration order naturally stays category-order for
        // whatever remains selected, so no extra sorting is needed here.
        enabledStatKeys: Array.from(selectedStatKeys),
      });
      showScreen("table_lobby", { roomId: result.data.roomId });
    } catch (err) {
      errorText.textContent = err.message || "Couldn't create the room.";
      startBtn.disabled = false;
      startBtn.textContent = "CREATE ROOM & GO TO LOBBY";
    }
  });
}
