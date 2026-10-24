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
// Endpoint for ESP32 to update GPS location
router.post("/gps", async (req: Request, res: Response) => {
  try {
    const { busId, lat, lng, speed, status } = req.body;

    if (!busId || lat === undefined || lng === undefined) {
       res.status(400).json({ error: "Missing busId, lat, or lng" });
       return;
    }

    // We store the latest GPS location in a 'buses' collection.
    // Using set(..., {merge: true}) ensures we update the bus record.
    await db.collection("buses").doc(busId).set({
      busId: busId,
      lastLocation: {
        lat: Number(lat),
        lng: Number(lng),
        speed: Number(speed || 0),
        status: status || "Moving",
        updatedAt: new Date().toISOString()
      }
    }, { merge: true });

    res.status(200).json({ message: "GPS location updated" });
  } catch (error: any) {
    console.error("GPS error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
