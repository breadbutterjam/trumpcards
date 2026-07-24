# Trump Cards — project scaffold

## What this is

A working skeleton wiring our design decisions into real Firebase code:
- Firestore data model with the public/private document split (see `firestore.rules`)
- Cloud Functions implementing server-authoritative room creation, joining,
  dealing, and round resolution (`functions/index.js`)
- A single-shell frontend (`public/index.html` + `public/js/router.js`) where
  screens are swapped in via JS rather than full page reloads, keeping
  Firestore listeners alive across navigation
- One screen (Table/lobby) fully rewired from the standalone HTML prototype
  to real data, as the pattern for converting the rest

## One-time setup

1. Install the Firebase CLI: `npm install -g firebase-tools`
2. `firebase login`
3. Create a project at https://console.firebase.google.com (free Spark plan
   is fine to start, but see "Cloud Functions requires Blaze" below)
4. Copy your web app's config into `public/js/firebase-init.js`, replacing
   the `REPLACE_ME` placeholders (Project settings → General → Your apps)
5. Enable **Anonymous** sign-in: Authentication → Sign-in method → Anonymous
6. Enable **Firestore**: Firestore Database → Create database (start in
   production mode — our `firestore.rules` file governs access)
7. From the project root: `firebase use --add` and select your project
8. `cd functions && npm install`

## Running locally (recommended before deploying)

```
firebase emulators:start
```

This runs Firestore, Functions, Auth, and Hosting locally with no cost and
no risk to real data. Point your browser at the local Hosting URL it prints.

## Deploying for real

```
firebase deploy
```

## Cloud Functions requires the Blaze plan

Enabling Cloud Functions requires upgrading from the free Spark plan to the
pay-as-you-go Blaze plan — but Blaze still includes a genuinely free monthly
quota of function invocations. For testing with a few friends at MVP scale,
you will very likely pay nothing. This is a real setup step (Firebase
console → upgrade plan), not just a code change.

## Known simplifications in this scaffold — read before extending

This is a first pass proving the architecture works end-to-end on one
screen, not a complete rebuild of every screen we've prototyped. Specific
things intentionally left unfinished:

- **Only the Table/lobby screen is wired to real data.** Every other screen
  (deck/shuffle, round evaluated, award animation, reader view, onboarding,
  login, game over) still exists only as a standalone prototype HTML file
  and needs to be converted into the screens/ pattern (fragment + JS module)
  the same way Table/lobby was.
- **Seat-angle tracking is duplicated.** `renderAvatarRow()` (shared) and
  `layoutSeatPositions()` (table_lobby.js, unused right now) both read the
  same players collection separately. These should be merged into one
  listener before building further — flagged inline in the code too.
- **The spin arrow doesn't yet rotate to the real first-chooser's seat
  angle** — it spins to a placeholder fixed angle. The server does
  correctly and fairly pick the real first chooser (`dealInitialHands`
  Cloud Function); only the cosmetic animation target isn't wired up yet.
- **Breakout/tie rounds are not implemented.** `confirmSelectionAndResolveRound`
  correctly detects a tie and stops (marks the round `"tied"` and returns
  the tied player IDs) but does not yet create the breakout round itself.
- **Elimination popup, game-over screen, explore mode, and onboarding/login
  are not built yet** — only discussed in design, not scaffolded in code.
- **Category data is duplicated** between `functions/data/states_of_india.json`
  and `public/data/states_of_india.json`, because Cloud Functions only
  bundles the `functions/` folder at deploy time and can't reach into
  `public/`. If you edit card data, edit both files, or we set up a build
  step later to generate one from the other.
- **No AFK/disconnect/nudge handling** — matches our MVP decision to defer
  this, but worth remembering it's still genuinely absent, not just hidden.

## Suggested next step

Pick the next screen to convert (deck/shuffle is a natural choice, since
`your_deck` is already referenced by the router as where Table/lobby
navigates to) and we rewire it the same way: fragment + JS module,
hardcoded data replaced by Firestore listeners and Cloud Function calls.
