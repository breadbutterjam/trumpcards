const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const CATEGORY_REGISTRY = {
  states_of_india: require("./data/states_of_india.json"),
  mountains: require("./data/mountains.json"),
};
const DEFAULT_CATEGORY_ID = "states_of_india";

function getCategoryData(categoryId) {
  return CATEGORY_REGISTRY[categoryId] || CATEGORY_REGISTRY[DEFAULT_CATEGORY_ID];
}
function getCardById(categoryId, cardId) {
  return getCategoryData(categoryId).cards.find((c) => c.id === cardId);
}
function getAllCardIds(categoryId) {
  return getCategoryData(categoryId).cards.map((c) => c.id);
}
// All cards in a category share the same stat schema — the first card is a
// reliable source for "what stat keys exist in this category at all."
function getAllStatKeys(categoryId) {
  const categoryData = getCategoryData(categoryId);
  return Object.keys(categoryData.cards[0].stats);
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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

// Shared by both round-resolution paths.
function applyRoundOutcome({ tx, roomRef, room, activePlayers, privateSnaps, winnerId, playersSnap, extraRoomFields = {} }) {
  const played = activePlayers.map((p, i) => ({
    playerId: p.id,
    cardId: privateSnaps[i].data().cardOrder[0],
    remainingOrder: privateSnaps[i].data().cardOrder.slice(1),
  }));

  const allPlayedCardIds = played.map((p) => p.cardId);
  const postRoundCounts = {};

  played.forEach((p) => {
    const playerRef = roomRef.collection("players").doc(p.playerId);
    const privateRef = playerRef.collection("private").doc("deck");

    if (p.playerId === winnerId) {
      const newOrder = [...p.remainingOrder, ...allPlayedCardIds];
      tx.set(privateRef, { cardOrder: newOrder });
      tx.update(playerRef, { cardCount: newOrder.length, status: "deciding" });
      postRoundCounts[p.playerId] = newOrder.length;
    } else {
      const newOrder = p.remainingOrder;
      const newStatus = newOrder.length === 0 ? "eliminated" : "deciding";
      tx.set(privateRef, { cardOrder: newOrder });
      tx.update(playerRef, { cardCount: newOrder.length, status: newStatus });
      postRoundCounts[p.playerId] = newOrder.length;
    }
  });

  const remainingActivePlayerIds = Object.keys(postRoundCounts).filter(
    (id) => postRoundCounts[id] > 0
  );

  if (remainingActivePlayerIds.length <= 1) {
    const winnerNames = remainingActivePlayerIds.map((id) => {
      const d = playersSnap.docs.find((doc) => doc.id === id);
      return d ? d.data().name : "Someone";
    });
    tx.update(roomRef, {
      status: "game_over",
      chooserPlayerId: null,
      winnerIds: remainingActivePlayerIds,
      winnerNames,
    });
    return { status: "game_over", winnerIds: remainingActivePlayerIds };
  }

  const winnerDoc = playersSnap.docs.find((d) => d.id === winnerId);
  const winnerName = winnerDoc ? winnerDoc.data().name : "Someone";
  const nextRoundNumber = room.currentRoundNumber + 1;
  const isOffline = room.mode === "offline";

  tx.update(roomRef, {
    chooserPlayerId: winnerId,
    currentRoundNumber: nextRoundNumber,
    lastRoundWinnerId: winnerId,
    lastRoundWinnerName: winnerName,
    ...extraRoomFields,
  });
  tx.set(roomRef.collection("rounds").doc(String(nextRoundNumber)), {
    chooserId: winnerId,
    category: null,
    direction: null,
    status: isOffline ? "awaiting_judge" : "selecting",
    winnerId: null,
    revealedPlayerIds: [],
    createdAt: FieldValue.serverTimestamp(),
  });

  return { status: "resolved", winnerId };
}

exports.createRoom = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before creating a room.");
  }
  const { playerName, avatar, maxPlayers, categoryId, mode, enabledStatKeys } = request.data;
  if (!playerName || typeof playerName !== "string") {
    throw new HttpsError("invalid-argument", "playerName is required.");
  }

  const resolvedCategoryId = CATEGORY_REGISTRY[categoryId] ? categoryId : DEFAULT_CATEGORY_ID;
  const resolvedMode = mode === "offline" ? "offline" : "online";

  // The room creator's chosen subset of properties to use this game.
  // Validated against the category's real stat keys — anything invalid is
  // silently dropped rather than trusted outright. Falls back to "every
  // property" if omitted or if filtering leaves nothing valid, so older
  // clients (or a skipped advanced-settings step) behave exactly as before.
  const allStatKeys = getAllStatKeys(resolvedCategoryId);
  let resolvedStatKeys =
    Array.isArray(enabledStatKeys) && enabledStatKeys.length > 0
      ? enabledStatKeys.filter((k) => allStatKeys.includes(k))
      : allStatKeys;
  if (resolvedStatKeys.length === 0) {
    resolvedStatKeys = allStatKeys;
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
    category: resolvedCategoryId,
    enabledStatKeys: resolvedStatKeys,
    mode: resolvedMode,
    judgePlayerId: playerId,
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
      return { roomId };
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
    if (room.status !== "lobby" && room.status !== "game_over") {
      throw new HttpsError("failed-precondition", "This room has already started.");
    }

    const playersSnap = await tx.get(roomRef.collection("players"));
    const players = playersSnap.docs;
    if (players.length < 2) {
      throw new HttpsError("failed-precondition", "Need at least 2 players to start.");
    }

    const allCardIds = getAllCardIds(room.category);
    const shuffledIds = shuffle(allCardIds);
    const hands = players.map(() => []);
    shuffledIds.forEach((cardId, i) => {
      hands[i % players.length].push(cardId);
    });

    players.forEach((playerDoc, i) => {
      const privateRef = playerDoc.ref.collection("private").doc("deck");
      tx.set(privateRef, { cardOrder: hands[i] });
      tx.update(playerDoc.ref, { cardCount: hands[i].length, status: "deciding" });
    });

    const newRoundNumber = (room.currentRoundNumber || 0) + 1;
    const isOffline = room.mode === "offline";

    if (isOffline) {
      tx.update(roomRef, {
        status: "in_progress",
        chooserPlayerId: null,
        turnOrderQueue: [],
        currentRoundNumber: newRoundNumber,
        startAcks: [],
        winnerIds: [],
      });
      tx.set(roomRef.collection("rounds").doc(String(newRoundNumber)), {
        chooserId: null,
        category: null,
        direction: null,
        status: "awaiting_judge",
        winnerId: null,
        revealedPlayerIds: [],
        createdAt: FieldValue.serverTimestamp(),
      });
      return { firstChooser: null };
    }

    const firstChooser = players[Math.floor(Math.random() * players.length)].id;
    const turnOrderQueue = players.map((p) => p.id);

    tx.update(roomRef, {
      status: "hands_dealt",
      chooserPlayerId: firstChooser,
      turnOrderQueue,
      currentRoundNumber: newRoundNumber,
      startAcks: [],
      winnerIds: [],
    });

    tx.set(roomRef.collection("rounds").doc(String(newRoundNumber)), {
      chooserId: firstChooser,
      category: null,
      direction: null,
      status: "selecting",
      winnerId: null,
      revealedPlayerIds: [],
      createdAt: FieldValue.serverTimestamp(),
    });

    return { firstChooser };
  });
});

exports.acknowledgeGameStart = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const { roomId } = request.data;
  const roomRef = db.collection("rooms").doc(roomId);

  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data();

    if (room.status !== "hands_dealt") {
      return { status: room.status };
    }

    const playersSnap = await tx.get(roomRef.collection("players"));
    const activeCount = playersSnap.size;

    const acks = new Set(room.startAcks || []);
    acks.add(request.auth.uid);
    const ackArray = Array.from(acks);
    const allReady = ackArray.length >= activeCount;

    tx.update(roomRef, {
      startAcks: ackArray,
      status: allReady ? "in_progress" : "hands_dealt",
    });

    return { status: allReady ? "in_progress" : "hands_dealt" };
  });
});

// Records that a player has revealed their card for the current round.
// Purely informational (the tick everyone sees) and, client-side only, used
// to gate the chooser's confirm button — the server does NOT enforce this
// for resolution itself (deliberate MVP scope decision).
exports.markCardRevealed = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const { roomId } = request.data;
  const roomRef = db.collection("rooms").doc(roomId);

  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data();

    const roundRef = roomRef.collection("rounds").doc(String(room.currentRoundNumber));
    const roundSnap = await tx.get(roundRef);
    if (!roundSnap.exists) throw new HttpsError("not-found", "Round not found.");
    const round = roundSnap.data();

    const revealed = new Set(round.revealedPlayerIds || []);
    revealed.add(request.auth.uid);
    tx.update(roundRef, { revealedPlayerIds: Array.from(revealed) });

    return { revealedPlayerIds: Array.from(revealed) };
  });
});

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

    if (room.mode === "offline") {
      throw new HttpsError("failed-precondition", "This room is in offline mode — the judge declares the winner directly.");
    }
    if (room.chooserPlayerId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Only the current chooser can pick a category.");
    }
    // Server-side enforcement of the room's property selection — even
    // though the UI never offers a disabled/hidden stat as an option, a
    // client could still send an arbitrary statKey directly, so this is
    // validated independently of what the UI shows.
    if (room.enabledStatKeys && !room.enabledStatKeys.includes(statKey)) {
      throw new HttpsError("invalid-argument", "That property isn't part of this game.");
    }

    const roundRef = roomRef.collection("rounds").doc(String(room.currentRoundNumber));
    const roundSnap = await tx.get(roundRef);
    const round = roundSnap.data();
    if (round.status !== "selecting") {
      throw new HttpsError("failed-precondition", "This round has already been decided.");
    }

    const playersSnap = await tx.get(roomRef.collection("players"));
    const activePlayers = playersSnap.docs.filter((d) => d.data().status !== "eliminated");

    const privateRefs = activePlayers.map((p) => p.ref.collection("private").doc("deck"));
    const privateSnaps = privateRefs.length > 0 ? await tx.getAll(...privateRefs) : [];

    const played = activePlayers.map((p, i) => {
      const cardOrder = privateSnaps[i].data().cardOrder;
      const cardId = cardOrder[0];
      const card = getCardById(room.category, cardId);
      return {
        playerId: p.id,
        cardId,
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
      return { status: "tied", tiedPlayerIds: winners.map((w) => w.playerId) };
    }

    tx.update(roundRef, {
      category: statKey,
      direction,
      status: "resolved",
      winnerId: sorted[0].playerId,
      resolvedAt: FieldValue.serverTimestamp(),
    });

    const winnerCardId = sorted[0].cardId;
    const winnerCard = getCardById(room.category, winnerCardId);
    const statInfo = winnerCard.stats[statKey];

    return applyRoundOutcome({
      tx, roomRef, room, activePlayers, privateSnaps,
      winnerId: sorted[0].playerId, playersSnap,
      extraRoomFields: {
        lastRoundCardRegion: winnerCard.region,
        lastRoundStatKey: statKey,
        lastRoundStatLabel: statInfo.label,
        lastRoundStatDisplay: statInfo.display,
        lastRoundDirection: direction,
        lastRoundWinnerCardId: winnerCardId,
      },
    });
  });
});

exports.resolveOfflineModeRound = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const { roomId, winnerId } = request.data;
  if (!winnerId) {
    throw new HttpsError("invalid-argument", "winnerId is required.");
  }

  const roomRef = db.collection("rooms").doc(roomId);

  return db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists) throw new HttpsError("not-found", "Room not found.");
    const room = roomSnap.data();

    if (room.mode !== "offline") {
      throw new HttpsError("failed-precondition", "This room is not in offline mode.");
    }
    if (room.judgePlayerId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Only the judge can declare a round's winner.");
    }

    const roundRef = roomRef.collection("rounds").doc(String(room.currentRoundNumber));
    const roundSnap = await tx.get(roundRef);
    const round = roundSnap.data();
    if (!round || round.status !== "awaiting_judge") {
      throw new HttpsError("failed-precondition", "This round has already been decided.");
    }

    const playersSnap = await tx.get(roomRef.collection("players"));
    const activePlayers = playersSnap.docs.filter((d) => d.data().status !== "eliminated");

    if (!activePlayers.some((p) => p.id === winnerId)) {
      throw new HttpsError("invalid-argument", "winnerId must be one of the currently active players.");
    }

    const privateRefs = activePlayers.map((p) => p.ref.collection("private").doc("deck"));
    const privateSnaps = privateRefs.length > 0 ? await tx.getAll(...privateRefs) : [];

    const playedCardsMap = {};
    activePlayers.forEach((p, i) => {
      playedCardsMap[p.id] = privateSnaps[i].data().cardOrder[0];
    });
    tx.set(roundRef.collection("reveal").doc("data"), { playedCards: playedCardsMap });

    tx.update(roundRef, {
      status: "resolved",
      winnerId,
      resolvedAt: FieldValue.serverTimestamp(),
    });

    return applyRoundOutcome({ tx, roomRef, room, activePlayers, privateSnaps, winnerId, playersSnap });
  });
});
