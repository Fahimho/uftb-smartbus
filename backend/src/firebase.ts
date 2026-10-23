import { initializeApp } from "firebase-admin/app";

// Tell Firebase to use the local emulators
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "uftb-smartbus-dev";

// Initialize the app
const app = initializeApp();

export default app;