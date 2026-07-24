// Shared avatar catalogue. Each id must match an actual image file at
// assets/avatars/{id}.png (you mentioned you have 15 animal images from
// another project — drop them in using these exact filenames, or edit the
// `file` field below to match whatever names your images actually use).
export const AVATARS = [
  { id: "ant", label: "Ant", file: "ant.png" },
  { id: "capybara", label: "Capybara", file: "capybara.png" },
  { id: "elephant", label: "Elephant", file: "elephant.png" },
  { id: "giraffe", label: "Giraffe", file: "giraffe.png" },
  { id: "hedgehog", label: "Hedgehog", file: "hedgehog.png" },
  { id: "hippo", label: "Hippo", file: "hippo.png" },
  { id: "koala", label: "Koala", file: "koala.png" },
  { id: "meerkat", label: "Meerkat", file: "meerkat.png" },
  { id: "otter", label: "Otter", file: "otter.png" },
  { id: "panda", label: "Panda", file: "panda.png" },
  { id: "penguin", label: "Penguin", file: "penguin.png" },
  { id: "platypus", label: "Platypus", file: "platypus.png" },
  { id: "rhinoceros", label: "Rhinoceros", file: "rhinoceros.png" },
  { id: "sloth", label: "Sloth", file: "sloth.png" },
  { id: "wombat", label: "Wombat", file: "wombat.png" }
];

const AVATAR_BY_ID = {};
AVATARS.forEach((a) => { AVATAR_BY_ID[a.id] = a; });

/**
 * Returns an <img> tag for a given avatar id, with a graceful fallback
 * (a colored circle showing the first letter) if the image file is
 * missing — so the app doesn't look broken while you're still dropping
 * in real assets, or if an unrecognized id ever shows up.
 */
export function avatarImgHtml(avatarId, extraClass = "") {
  const avatar = AVATAR_BY_ID[avatarId];
  const label = avatar ? avatar.label : "?";
  const src = avatar ? `assets/avatars/${avatar.file}` : "";
  const initial = label.charAt(0).toUpperCase();

  return `
    <img
      src="${src}"
      alt="${label}"
      class="avatar-img ${extraClass}"
      onerror="this.replaceWith(Object.assign(document.createElement('div'), {
        className: 'avatar-img avatar-img-fallback ${extraClass}',
        textContent: '${initial}'
      }))"
    />
  `;
}

export function avatarLabel(avatarId) {
  const avatar = AVATAR_BY_ID[avatarId];
  return avatar ? avatar.label : avatarId;
}
