// Shared across screens: loading category JSON and rendering a full card's
// markup. Cached per categoryId, so multiple screens/overlays requesting
// the same category within one session only fetch it once.

const categoryCache = {};

export async function loadCategoryData(categoryId) {
  if (!categoryCache[categoryId]) {
    categoryCache[categoryId] = await fetch(`data/${categoryId}.json`).then((r) => r.json());
  }
  return categoryCache[categoryId];
}

export function cardById(categoryData, cardId) {
  return categoryData.cards.find((c) => c.id === cardId);
}

export function cardBackgroundCss(imageValue) {
  const isGradient = /^(linear|radial)-gradient\(/.test(imageValue.trim());
  return isGradient ? imageValue : `url('${imageValue}')`;
}

/**
 * Renders a full card's markup (background image, region/nickname, stats
 * grid). Optionally highlights one stat with a floating direction pill —
 * used by the winner-card-detail overlay.
 *
 * `enabledStatKeys`, when provided, restricts which stats render at all
 * (not just visually — the others are simply never in the markup) and
 * preserves the given key order. Omit it to show every stat the card has
 * (used for unrestricted/full-category browsing).
 *
 * @param {object} card
 * @param {{ highlightStatKey?: string, direction?: string, enabledStatKeys?: string[] }} [options]
 * @returns {string} HTML
 */
export function renderFullCardHtml(card, options = {}) {
  const { highlightStatKey, direction, enabledStatKeys } = options;

  const entries = Array.isArray(enabledStatKeys)
    ? enabledStatKeys
        .filter((key) => card.stats[key])
        .map((key) => [key, card.stats[key]])
    : Object.entries(card.stats);

  const statsHtml = entries.map(([key, s]) => {
    const isHighlighted = highlightStatKey && key === highlightStatKey;
    return `
      <div class="stat-cell readonly${isHighlighted ? " winner-highlight" : ""}">
        ${isHighlighted && direction ? `<div class="winner-direction-pill">${direction}</div>` : ""}
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.display}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="reveal-card" style="background-image:${cardBackgroundCss(card.images[0])}; height:100%; border-radius:0;">
      <div class="reveal-gradient"></div>
      <div class="reveal-stats"><div class="reveal-region">
        ${card.region}
        ${card.nickname ? `<div class="reveal-nickname">${card.nickname}</div>` : ""}
      </div>${statsHtml}</div>
    </div>
  `;
}
