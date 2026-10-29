import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/** Must match FIRESTORE_DATABASE_ID on the server and the database in firebase.json. */
export const FIRESTORE_DATABASE_ID = "ad-radar";

// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced literally.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = (): FirebaseApp => (getApps().length ? getApp() : initializeApp(config));

/** Browser-only accessors — call from effects and event handlers, never during render. */
export const clientAuth = (): Auth => getAuth(app());
export const clientDb = (): Firestore => getFirestore(app(), FIRESTORE_DATABASE_ID);
