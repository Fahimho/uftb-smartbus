import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
  projectId: "uftb-smartbus-dev",
  apiKey: "fake-api-key", 
  storageBucket: "uftb-smartbus-dev.appspot.com" // <-- Add this line
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Tell the frontend to use the local Emulator on port 9099
connectAuthEmulator(auth, "http://127.0.0.1:9099");