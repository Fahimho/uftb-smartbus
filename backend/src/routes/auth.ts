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

// 1. PUBLIC REGISTRATION (For Students)
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, displayName, studentId, department, phone } = req.body;

    if (!email || !password) {
       res.status(400).json({ error: "Email and password are required." });
       return;
    }

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || "New Student",
    });

    // FORCE the role to be "student" for public registration
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      displayName: displayName || "New Student",
      role: "student", // <-- LOCKED TO STUDENT
      studentId: studentId || "",
      department: department || "",
      phone: phone || "",
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      message: "Student registered successfully",
      uid: userRecord.uid,
      role: "student"
    });

  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(400).json({ error: error.message });
  }
});

// 2. PROTECTED REGISTRATION (For Admins/Operators)
router.post("/register-staff", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const requesterDoc = await db.collection("users").doc(req.user.uid).get();
    if (!requesterDoc.exists || requesterDoc.data()?.role !== "admin") {
      res.status(403).json({ error: "Only Admins can create new staff accounts." });
      return;
    }

    const { email, password, displayName, role, assignedBusId } = req.body; // <-- ADDED assignedBusId

    if (!email || !password) {
       res.status(400).json({ error: "Email and password are required." });
       return;
    }

    const assignedRole = (role === "admin" || role === "operator") ? role : "operator";

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || "New Staff",
    });

    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      displayName: displayName || "New Staff",
      role: assignedRole,
      assignedBusId: assignedBusId || "", // <-- SAVED HERE
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      message: "Staff registered successfully",
      uid: userRecord.uid,
      role: assignedRole
    });

  } catch (error: any) {
    console.error("Staff registration error:", error);
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