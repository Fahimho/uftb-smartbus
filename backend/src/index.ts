import { initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp as initClientApp } from "firebase/app";
import { 
  getAuth as getClientAuth, 
  connectAuthEmulator, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { 
  getFirestore as getClientFirestore, 
  connectFirestoreEmulator, 
  doc, 
  setDoc 
} from "firebase/firestore";

// --- 1. SETUP ADMIN (Bypasses Security Rules) ---
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "uftb-smartbus-dev";

const adminApp = initAdminApp();
const adminDb = getAdminFirestore();

// --- 2. SETUP CLIENT (Obeys Security Rules) ---
const clientConfig = {
  projectId: "uftb-smartbus-dev",
  apiKey: "fake-api-key", 
};
const clientApp = initClientApp(clientConfig);
const clientAuth = getClientAuth(clientApp);
const clientDb = getClientFirestore(clientApp);

connectAuthEmulator(clientAuth, "http://127.0.0.1:9099");
connectFirestoreEmulator(clientDb, "127.0.0.1", 8080);

// --- 3. TEST FUNCTION ---
async function runSecurityTests() {
  console.log("========================================");
  console.log("UFTB SmartBus — Security Rules Test");
  console.log("========================================");

  await adminDb.collection("students").doc("student_1").set({ name: "Real Student" });

  // TEST 1: Unauthenticated Hacker
  console.log("\n[Test 1] Unauthenticated user trying to write a student record...");
  try {
    await setDoc(doc(clientDb, "students", "student_2"), { name: "Hacked Data" });
    console.log("❌ FAILED: Hacker was able to write!");
  } catch (error: any) {
    console.log("✅ SUCCESS: Write denied. (Code:", error.code, ")");
  }

  // TEST 2: Create an Admin User and sign in
  console.log("\n[Test 2] Admin trying to write a student record...");
  const email = "admin@uftb.edu";
  const password = "password123";
  
  let uid;
  try {
    const userCredential = await createUserWithEmailAndPassword(clientAuth, email, password);
    uid = userCredential.user.uid;
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') {
      const userCredential = await signInWithEmailAndPassword(clientAuth, email, password);
      uid = userCredential.user.uid;
    } else {
      throw error;
    }
  }

  // Give user the admin role using Admin SDK (bypasses rules)
  await adminDb.collection("users").doc(uid).set({ role: "admin" });
  // Sign in again to refresh token
  await signInWithEmailAndPassword(clientAuth, email, password);
  
  try {
    await setDoc(doc(clientDb, "students", "student_3"), { name: "Admin Added Student" });
    console.log("✅ SUCCESS: Admin was allowed to write.");
  } catch (error: any) {
    console.log("❌ FAILED: Admin was denied!", error.message);
  }

  // TEST 3: User trying to change their own role
  console.log("\n[Test 3] User trying to change their own role to admin (Should be denied)...");
  
  // First, secretly demote them to student using Admin SDK
  await adminDb.collection("users").doc(uid).set({ role: "student" });
  // Sign in again to refresh token
  await signInWithEmailAndPassword(clientAuth, email, password);

  const adminUserRef = doc(clientDb, "users", uid);
  try {
    await setDoc(adminUserRef, { role: "admin" }, { merge: true });
    console.log("❌ FAILED: User was able to change their own role!");
  } catch (error: any) {
    console.log("✅ SUCCESS: Role update denied.");
  }

  console.log("\n========================================");
  console.log("Tests Complete.");
  process.exit(0);
}

runSecurityTests().catch(console.error);