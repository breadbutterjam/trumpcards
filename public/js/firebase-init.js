// Firebase client bootstrap — shared by every screen.
// Uses the CDN-hosted modular SDK directly via <script type="module">, no build step.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions,
  connectFunctionsEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// Your real project config — keep these values as they are.
const firebaseConfig = {
  apiKey: "AIzaSyAXob0KGsW97XAnesgipoMbR-N9TVBnYHc",
  authDomain: "trumpcards-2b419.firebaseapp.com",
  projectId: "trumpcards-2b419",
  storageBucket: "trumpcards-2b419.appspot.com",
  messagingSenderId: "182665771264",
  appId: "1:182665771264:web:eddd6c2a81637f70bd1be5",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
//   connectFirestoreEmulator(db, "127.0.0.1", 8080);
//   connectFunctionsEmulator(functions, "127.0.0.1", 5001);
//   connectAuthEmulator(auth, "http://127.0.0.1:9099");
// }
const isLocalTesting =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname.startsWith("192.168.") ||
  location.hostname.startsWith("10.");

if (isLocalTesting) {
  const emulatorHost = location.hostname; // whichever address the browser actually used
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectFunctionsEmulator(functions, emulatorHost, 5001);
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
}

let signInPromise = null;

export function whenSignedIn() {
  if (!signInPromise) {
    signInPromise = new Promise((resolve, reject) => {
      onAuthStateChanged(auth, (user) => {
        if (user) {
          resolve(user);
        } else {
          signInAnonymously(auth).catch(reject);
        }
      });
    });
  }
  return signInPromise;
}