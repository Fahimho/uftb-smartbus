import { requireAuth, AuthRequest } from "../middleware/auth.ts"; 
import { Router, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import "../firebase.ts"; 

const router = Router();
const adminAuth = getAuth();
const db = getFirestore();

// Test route
router.get("/test", (req: Request, res: Response) => {
  res.json({ message: "Auth API is working!" });
});

// Registration Route
router.post("/register", async (req: Request, res: Response) => {
  try {
    // 1. Extract 'role' from the request body
    const { email, password, displayName, role } = req.body;

    if (!email || !password) {
       res.status(400).json({ error: "Email and password are required." });
       return;
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || "New User",
    });

    // 2. Default to "student" if no role is provided
    const assignedRole = role || "student";

    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      displayName: displayName || "New User",
      role: assignedRole, // 3. Apply the role here
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      message: "User registered successfully",
      uid: userRecord.uid,
      role: assignedRole
    });

  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Get current user profile
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
       res.status(404).json({ error: "User profile not found" });
       return;
    }

    res.json({ profile: userDoc.data() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;