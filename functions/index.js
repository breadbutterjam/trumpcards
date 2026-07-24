const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// Static card data — see README for why this file is duplicated under public/data too.
const CATEGORY = require("./data/states_of_india.json");
const CARD_BY_ID = {};
CATEGORY.cards.forEach((c) => { CARD_BY_ID[c.id] = c; });
const ALL_CARD_IDS = CATEGORY.cards.map((c) => c.id);

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids visual confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Creates a room and adds the creator as its first player. Room ID = the
// human-readable code itself, so joining is a direct document lookup.
exports.createRoom = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before creating a room.");
  }
  const { playerName, avatar, maxPlayers } = request.data;
  if (!playerName || typeof playerName !== "string") {
    throw new HttpsError("invalid-argument", "playerName is required.");
  }

  const playerId = request.auth.uid;
  let roomId;
  let attempts = 0;

  while (attempts < 5) {
    roomId = generateRoomCode();
    const existing = await db.collection("rooms").doc(roomId).get();
    if (!existing.exists) break;
    attempts++;
  }
  if (attempts === 5) {
    throw new HttpsError("internal", "Could not generate a unique room code — try again.");
  }

  const roomRef = db.collection("rooms").doc(roomId);
  await roomRef.set({
    category: CATEGORY.categoryId,
    status: "lobby",
    maxPlayers: maxPlayers || 6,
    currentRoundNumber: 0,
    chooserPlayerId: null,
    turnOrderQueue: [],
    winnerIds: [],
    createdAt: FieldValue.serverTimestamp(),
  });

  await roomRef.collection("players").doc(playerId).set({
    name: playerName,
    avatar: avatar || "🙂",
    seatIndex: 0,
    cardCount: 0,
    status: "deciding",
    joinedAt: FieldValue.serverTimestamp(),
  });

  return { roomId };
});

// Joins an existing room. Rejects outright if the game already started —
// matches the "late joins not allowed" MVP rule (spectate mode is post-MVP).
exports.joinRoom = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before joining a room.");
  }
  const { roomCode, playerName, avatar } = request.data;
  if (!roomCode || !playerName) {
    throw new HttpsError("invalid-argument", "roomCode and playerName are required.");
  }

  const roomId = roomCode.toUpperCase();
  const roomRef = db.collection("rooms").doc(roomId);
  const playerId = request.auth.uid;

  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) {
      throw new HttpsError("not-found", "That room code doesn't exist.");
    }
    const room = roomSnap.data();
    if (room.status !== "lobby") {
      throw new HttpsError("failed-precondition", "This game has already started.");
    }

    const playersSnap = await tx.get(roomRef.collection("players"));
    if (playersSnap.size >= room.maxPlayers) {
      throw new HttpsError("resource-exhausted", "This room is full.");
    }
    if (playersSnap.docs.some((d) => d.id === playerId)) {
      return { roomId }; // already joined (e.g. reconnect) — treat as success
    }

    tx.set(roomRef.collection("players").doc(playerId), {
      name: playerName,
      avatar: avatar || "🙂",
      seatIndex: playersSnap.size,
      cardCount: 0,
      status: "deciding",
      joinedAt: FieldValue.serverTimestamp(),
    });

    return { roomId };
  });
});

// Shuffles the deck, deals it evenly across current players, and randomly
// picks who chooses first — done here (not on the client) specifically so no
// player can rig their own "spin the bottle" result. The client's spin
// animation is purely cosmetic; it just lands on whatever this returns.
exports.dealInitialHands = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const { roomId } = request.data;
  const roomRef = db.collection("rooms").doc(roomId);

  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data();
    if (room.status !== "lobby") {
      throw new HttpsError("failed-precondition", "This room has already started.");
    }

    const playersSnap = await tx.get(roomRef.collection("players"));
    const players = playersSnap.docs;
    if (players.length < 2) {
      throw new HttpsError("failed-precondition", "Need at least 2 players to start.");
    }

    const shuffledIds = shuffle(ALL_CARD_IDS);
    const hands = players.map(() => []);
    shuffledIds.forEach((cardId, i) => {
      hands[i % players.length].push(cardId);
    });

    players.forEach((playerDoc, i) => {
      const privateRef = playerDoc.ref.collection("private").doc("deck");
      tx.set(privateRef, { cardOrder: hands[i] });
      tx.update(playerDoc.ref, { cardCount: hands[i].length, status: "deciding" });
    });

    const firstChooser = players[Math.floor(Math.random() * players.length)].id;
    const turnOrderQueue = players.map((p) => p.id);

    tx.update(roomRef, {
      status: "in_progress",
      chooserPlayerId: firstChooser,
      turnOrderQueue,
      currentRoundNumber: 1,
    });

    tx.set(roomRef.collection("rounds").doc("1"), {
      chooserId: firstChooser,
      category: null,
      direction: null,
      status: "selecting",
      winnerId: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { firstChooser };
  });
});

// The core round lifecycle in one atomic step: the chooser's pick is
// validated, every active player's top card is compared (server-side only —
// this is exactly the data the security rules hide from clients), a winner
// (or tie) is determined, cards move to the winner's deck, and the next
// round is opened with the winner as the new chooser.
exports.confirmSelectionAndResolveRound = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const { roomId, statKey, direction } = request.data;
  if (!statKey || !["High", "Low"].includes(direction)) {
    throw new HttpsError("invalid-argument", "statKey and a valid direction are required.");
  }

  const roomRef = db.collection("rooms").doc(roomId);

  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data();

    if (room.chooserPlayerId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Only the current chooser can pick a category.");
    }

    const roundRef = roomRef.collection("rounds").doc(String(room.currentRoundNumber));
    const roundSnap = await tx.get(roundRef);
    const round = roundSnap.data();
    if (round.status !== "selecting") {
      throw new HttpsError("failed-precondition", "This round has already been decided.");
    }

    const playersSnap = await tx.get(roomRef.collection("players"));
    const activePlayers = playersSnap.docs.filter((d) => d.data().status !== "eliminated");

    const privateSnaps = await Promise.all(
      activePlayers.map((p) => tx.get(p.ref.collection("private").doc("deck")))
    );

    const played = activePlayers.map((p, i) => {
      const cardOrder = privateSnaps[i].data().cardOrder;
      const cardId = cardOrder[0];
      const card = CARD_BY_ID[cardId];
      return {
        playerId: p.id,
        cardId,
        remainingOrder: cardOrder.slice(1),
        statValue: card.stats[statKey].value,
      };
    });

    const sorted = played.slice().sort((a, b) =>
      direction === "High"
        ? (a.statValue < b.statValue ? 1 : a.statValue > b.statValue ? -1 : 0)
        : (a.statValue > b.statValue ? 1 : a.statValue < b.statValue ? -1 : 0)
    );
    const bestValue = sorted[0].statValue;
    const winners = sorted.filter((p) => p.statValue === bestValue);
    const isTie = winners.length > 1;

    const playedCardsMap = {};
    played.forEach((p) => { playedCardsMap[p.playerId] = p.cardId; });
    tx.set(roundRef.collection("reveal").doc("data"), { playedCards: playedCardsMap });

    if (isTie) {
      tx.update(roundRef, {
        category: statKey,
        direction,
        status: "tied",
        tiedPlayerIds: winners.map((w) => w.playerId),
        resolvedAt: FieldValue.serverTimestamp(),
      });
      // Breakout-round creation (tied players re-pick a new stat, same chooser)
      // is intentionally not implemented yet in this scaffold — see README.
      return { status: "tied", tiedPlayerIds: winners.map((w) => w.playerId) };
    }

    const winnerId = sorted[0].playerId;
    tx.update(roundRef, {
      category: statKey,
      direction,
      status: "resolved",
      winnerId,
      resolvedAt: FieldValue.serverTimestamp(),
    });

    const allPlayedCardIds = played.map((p) => p.cardId);

    played.forEach((p) => {
      const playerRef = roomRef.collection("players").doc(p.playerId);
      const privateRef = playerRef.collection("private").doc("deck");

      if (p.playerId === winnerId) {
        const newOrder = [...p.remainingOrder, ...allPlayedCardIds];
        tx.set(privateRef, { cardOrder: newOrder });
        tx.update(playerRef, { cardCount: newOrder.length, status: "deciding" });
      } else {
        const newOrder = p.remainingOrder;
        const newStatus = newOrder.length === 0 ? "eliminated" : "deciding";
        tx.set(privateRef, { cardOrder: newOrder });
        tx.update(playerRef, { cardCount: newOrder.length, status: newStatus });
      }
    });

    const nextRoundNumber = room.currentRoundNumber + 1;
    tx.update(roomRef, {
      chooserPlayerId: winnerId,
      currentRoundNumber: nextRoundNumber,
    });
    tx.set(roomRef.collection("rounds").doc(String(nextRoundNumber)), {
      chooserId: winnerId,
      category: null,
      direction: null,
      status: "selecting",
      winnerId: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { status: "resolved", winnerId };
  });
});
