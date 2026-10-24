import { Router, Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import "../firebase.ts";

const router = Router();
const db = getFirestore();

// Endpoint for ESP32 to post attendance
router.post("/attendance", async (req: Request, res: Response) => {
  try {
    const { uid, type, busId } = req.body;

    if (!uid || !type || !busId) {
       res.status(400).json({ error: "Missing uid, type, or busId" });
       return;
    }

    // 1. Save to Firestore (tripAttendance collection)
    const eventData = {
      uid: uid,
      type: type, // BOARDING or EXIT
      busId: busId,
      timestamp: new Date().toISOString(),
    };

    const docRef = await db.collection("tripAttendance").add(eventData);

    console.log(`[DB] Saved attendance event for card ${uid}`);

    res.status(201).json({
      message: "Attendance recorded",
      eventId: docRef.id,
    });

  } catch (error: any) {
    console.error("Attendance error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
