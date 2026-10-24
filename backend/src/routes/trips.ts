import { Router, Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import "../firebase.ts";
import { mqttClient } from "../index.ts";

const router = Router();
const db = getFirestore();

// 1. Start a Trip
router.post("/start", async (req: Request, res: Response) => {
  try {
    const { busId, operatorUid } = req.body;
    const activeTrips = await db.collection("trips").where("busId", "==", busId).where("status", "==", "IN_PROGRESS").get();

    if (!activeTrips.empty) {
       res.status(400).json({ error: "A trip is already active for this bus." });
       return;
    }

    const tripData = {
      busId,
      operatorUid: operatorUid || "unknown",
      status: "IN_PROGRESS",
      startedAt: new Date().toISOString(),
    };

    const docRef = await db.collection("trips").add(tripData);
    res.status(201).json({ message: "Trip started", tripId: docRef.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. End a Trip
router.post("/end", async (req: Request, res: Response) => {
  try {
    const { busId } = req.body;
    const activeTrips = await db.collection("trips").where("busId", "==", busId).where("status", "==", "IN_PROGRESS").get();

    if (activeTrips.empty) {
       res.status(400).json({ error: "No active trip found for this bus." });
       return;
    }

    const tripDoc = activeTrips.docs[0]!;
    await tripDoc.ref.update({
      status: "COMPLETED",
      endedAt: new Date().toISOString(),
    });

    res.status(200).json({ message: "Trip ended successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Record Attendance
router.post("/attendance", async (req: Request, res: Response) => {
  try {
    const { uid, type, busId } = req.body;

    if (!uid || !type || !busId) {
       res.status(400).json({ error: "Missing uid, type, or busId" });
       return;
    }

    const activeTrips = await db.collection("trips").where("busId", "==", busId).where("status", "==", "IN_PROGRESS").get();

    if (activeTrips.empty) {
       res.status(400).json({ error: "No active trip. Ignoring scan." });
       return;
    }

    const tripId = activeTrips.docs[0]!.id;

    const eventData = {
      uid: uid,
      type: type,
      busId: busId,
      tripId: tripId,
      timestamp: new Date().toISOString(),
    };

    const docRef = await db.collection("tripAttendance").add(eventData);
    res.status(201).json({ message: "Attendance recorded", eventId: docRef.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. GPS Endpoint
router.post("/gps", async (req: Request, res: Response) => {
  try {
    const { busId, lat, lng, speed, status } = req.body;
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
    res.status(500).json({ error: error.message });
  }
});

// 5. Trigger Emergency
router.post("/emergency", async (req: Request, res: Response) => {
  try {
    const { busId, lat, lng } = req.body;
    const emergencyData = {
      busId,
      lat: lat || 0,
      lng: lng || 0,
      status: "ACTIVE",
      timestamp: new Date().toISOString(),
      cellularNotification: "not_configured" 
    };
    const docRef = await db.collection("emergencyEvents").add(emergencyData);
    res.status(201).json({ message: "Emergency recorded", eventId: docRef.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Get Active Emergencies
router.get("/emergency", async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection("emergencyEvents").where("status", "==", "ACTIVE").orderBy("timestamp", "desc").get();
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Resolve Emergency
router.post("/emergency/:id/resolve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.collection("emergencyEvents").doc(id).update({
      status: "RESOLVED",
      resolvedAt: new Date().toISOString()
    });
    res.json({ message: "Emergency resolved" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Student Request (Publishes to MQTT)
router.post("/request", async (req: Request, res: Response) => {
  try {
    const { busId, message } = req.body;
    const requestData = { busId, message, status: "PENDING", timestamp: new Date().toISOString() };
    
    await db.collection("busRequests").add(requestData);

    const topic = `smartbus/${busId}/request`;
    mqttClient.publish(topic, JSON.stringify({ message: message }));

    console.log(`[MQTT] Published to ${topic}: ${message}`);
    res.status(201).json({ message: "Request sent to bus via MQTT" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. ESP32 Fetches Pending Requests
router.get("/request/:busId", async (req: Request, res: Response) => {
  try {
    const { busId } = req.params;
    const snapshot = await db.collection("busRequests").where("busId", "==", busId).where("status", "==", "PENDING").get();
      
    if (snapshot.empty) {
      res.json({ hasRequest: false });
      return;
    }

    const requestDoc = snapshot.docs[0]!;
    const requestData = requestDoc.data();

    await requestDoc.ref.update({ status: "DELIVERED" });

    res.json({ hasRequest: true, message: requestData.message });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;