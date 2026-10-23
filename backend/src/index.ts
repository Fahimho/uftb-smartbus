import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// 1. Tell Firebase to connect to the LOCAL emulator, not the real cloud
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "uftb-smartbus-dev";

// 2. Initialize the backend
initializeApp();
const db = getFirestore();

console.log("========================================");
console.log("UFTB SmartBus — Backend Connected to Emulator");
console.log("========================================");

// 3. Test the connection by writing a document
async function testDatabase() {
  try {
    console.log("Attempting to write to Firestore...");
    
    const docRef = db.collection("system_test").doc("connection");
    await docRef.set({
      status: "connected",
      timestamp: new Date().toISOString()
    });

    console.log("✅ Success! Data written to emulator.");
    
    const snapshot = await docRef.get();
    console.log("Data read back from Firestore:", snapshot.data());
    
  } catch (error) {
    console.error("❌ Error connecting to Firestore:", error);
  }
}

testDatabase();