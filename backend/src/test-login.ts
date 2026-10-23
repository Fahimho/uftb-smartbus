import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";

const clientConfig = { projectId: "uftb-smartbus-dev", apiKey: "fake-api-key" };
const app = initializeApp(clientConfig);
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099");

async function testLogin() {
  console.log("Logging in as Fahim...");
  
  // 1. Log in and get the token
  const userCredential = await signInWithEmailAndPassword(auth, "student@uftb.edu", "password123");
  const token = await userCredential.user.getIdToken();
  
  console.log("✅ Login successful. Token generated.");
  console.log("Fetching /api/auth/me from backend...\n");

  // 2. Call the backend with the token
  const response = await fetch("http://localhost:5000/api/auth/me", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  const data = await response.json();
  console.log("Backend Response:", data);
  process.exit(0);
}

testLogin().catch(console.error);