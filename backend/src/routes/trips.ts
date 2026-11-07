import { Router, Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import "../firebase.ts";
import { mqttClient } from "../index.ts";
import { getStorage } from "firebase-admin/storage";

const router = Router();
const db = getFirestore();

// ==========================================
// 1. Fleet Setup (Driver & Helper)
// ==========================================
router.post("/setup", async (req: Request, res: Response) => {
  try {
    const { busId, busName, route, driverName, driverPhone, helperName, helperPhone, emergencyContacts } = req.body;

    if (!busId) {
      res.status(400).json({ error: "Missing busId" });
      return;
    }

    await db.collection("buses").doc(busId).set({
      busId,
      busName: busName || "",
      route: route || "",
      driverName: driverName || "",
      driverPhone: driverPhone || "",
      helperName: helperName || "",
      helperPhone: helperPhone || "",
      emergencyContacts: emergencyContacts || [],
      updatedAt: new Date().toISOString()
    }, { merge: true });

    if (emergencyContacts && Array.isArray(emergencyContacts)) {
      const topic = `smartbus/${busId}/contacts`;
      const payload = JSON.stringify({ numbers: emergencyContacts });
      mqttClient.publish(topic, payload);
    }

    res.json({ message: "Fleet setup saved successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 2. Get Fleet Setup for a single bus
// ==========================================
router.get("/setup/:busId", async (req: Request, res: Response) => {
  try {
    const busId = req.params.busId as string; // <-- FIXED TYPESCRIPT ERROR
    const doc = await db.collection("buses").doc(busId).get();
    if (!doc.exists) {
      res.json({ message: "Bus not configured yet" });
      return;
    }
    res.json(doc.data());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// NEW: 3. Get ALL Buses
// ==========================================
router.get("/buses", async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection("buses").get();
    const buses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(buses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. Start a Trip
// ==========================================
router.post("/start", async (req: Request, res: Response) => {
  try {
    const { busId, operatorUid } = req.body;
    const activeTrips = await db.collection("trips").where("busId", "==", busId).where("status", "==", "IN_PROGRESS").get();

    if (!activeTrips.empty) {
       res.status(400).json({ error: "A trip is already active for this bus." });
       return;
    }

    const now = new Date();
    const bdTime = new Date(now.getTime() + (6 * 60 * 60 * 1000));
    
    const day = String(bdTime.getUTCDate()).padStart(2, '0');
    const month = String(bdTime.getUTCMonth() + 1).padStart(2, '0');
    const year = bdTime.getUTCFullYear();
    const hours = String(bdTime.getUTCHours()).padStart(2, '0');
    const minutes = String(bdTime.getUTCMinutes()).padStart(2, '0');
    
    const tripId = `TRIP-${day}-${month}-${year}-${hours}${minutes}`;

    const tripData = {
      busId,
      operatorUid: operatorUid || "unknown",
      status: "IN_PROGRESS",
      startedAt: now.toISOString(),
    };

    await db.collection("trips").doc(tripId).set(tripData);
    res.status(201).json({ message: "Trip started", tripId: tripId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. End a Trip
// ==========================================
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

    // BETTER DELETION: Use batch delete to ensure nothing is missed
    const historySnapshot = await db.collection("gpsHistory").where("busId", "==", busId).get();
    
    if (!historySnapshot.empty) {
      const batch = db.batch();
      historySnapshot.docs.forEach((doc) => { 
        batch.delete(doc.ref); 
      });
      await batch.commit();
      console.log(`[CLEANUP] Deleted ${historySnapshot.size} GPS points for ${busId}`);
    }

    res.status(200).json({ message: "Trip ended and GPS trail cleared" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. Record Attendance
// ==========================================
router.post("/attendance", async (req: Request, res: Response) => {
  try {
    const { uid, type, busId, studentName } = req.body;

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
      uid, type, busId, tripId,
      studentName: studentName || "Unknown",
      timestamp: new Date().toISOString(),
    };

    const docRef = await db.collection("tripAttendance").add(eventData);
    res.status(201).json({ message: "Attendance recorded", eventId: docRef.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 7. GPS Endpoint (Updated with IP)
// ==========================================
router.post("/gps", async (req: Request, res: Response) => {
  try {
    const { busId, lat, lng, speed, status, ip } = req.body; // <-- ADD ip
    await db.collection("buses").doc(busId).set({
      busId: busId,
      lastIp: ip || "Unknown",            // <-- ADD THIS
      lastIpUpdatedAt: new Date().toISOString(), // <-- ADD THIS
      lastLocation: {
        lat: Number(lat),
        lng: Number(lng),
        speed: Number(speed || 0),
        status: status || "Moving",
        updatedAt: new Date().toISOString()
      }
    }, { merge: true });

    await db.collection("gpsHistory").add({
      busId,
      lat: Number(lat),
      lng: Number(lng),
      timestamp: new Date().toISOString()
    });

    res.status(200).json({ message: "GPS location updated" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 8. Trigger Emergency
// ==========================================
router.post("/emergency", async (req: Request, res: Response) => {
  try {
    const { busId, lat, lng } = req.body;
    const emergencyData = {
      busId, lat: lat || 0, lng: lng || 0, status: "ACTIVE",
      timestamp: new Date().toISOString(), cellularNotification: "not_configured" 
    };
    const docRef = await db.collection("emergencyEvents").add(emergencyData);
    res.status(201).json({ message: "Emergency recorded", eventId: docRef.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 9. Get Active Emergencies
// ==========================================
router.get("/emergency", async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection("emergencyEvents").where("status", "==", "ACTIVE").orderBy("timestamp", "desc").get();
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 10. Resolve Emergency
// ==========================================
router.post("/emergency/:id/resolve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.collection("emergencyEvents").doc(id).update({
      status: "RESOLVED", resolvedAt: new Date().toISOString()
    });
    res.json({ message: "Emergency resolved" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 11. Student Request (Publishes to MQTT)
// ==========================================
router.post("/request", async (req: Request, res: Response) => {
  try {
    const { busId, message, studentName, lat, lng, studentUid } = req.body;
    
    if (!message || message.length > 35) { 
       res.status(400).json({ error: "Message too long for bus display" });
       return;
    }

    const requestData: any = { 
      busId, 
      message, 
      studentName: studentName || "Unknown Student",
      studentUid: studentUid || "unknown",
      status: "PENDING", 
      timestamp: new Date().toISOString() 
    };

    if (lat !== undefined && lng !== undefined) {
      requestData.lat = Number(lat);
      requestData.lng = Number(lng);
    }
    
    await db.collection("busRequests").add(requestData);

    const topic = `smartbus/${busId}/request`;
    mqttClient.publish(topic, JSON.stringify({ message: message }));

    res.status(201).json({ message: "Request sent to bus" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 12. ESP32 Fetches Pending Requests
// ==========================================
router.get("/request/:busId", async (req: Request, res: Response) => {
  try {
    const busId = req.params.busId as string;
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

// ==========================================
// 13. Admin Requests Photo
// ==========================================
router.post("/photo/request", async (req: Request, res: Response) => {
  try {
    const { busId } = req.body;
    const requestData = {
      busId, status: "PENDING", timestamp: new Date().toISOString()
    };
    const docRef = await db.collection("capturePhotoRequests").add(requestData);

    const topic = `smartbus/${busId}/camera`;
    mqttClient.publish(topic, JSON.stringify({ requestId: docRef.id, action: "CAPTURE" }));

    res.status(201).json({ message: "Camera trigger sent", requestId: docRef.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 14. ESP32 Uploads Photo
// ==========================================
router.post("/photo/upload", async (req: Request, res: Response) => {
  try {
    const { requestId, imageBase64 } = req.body;
    const base64Data = imageBase64.replace(/^data:image\/jpeg;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const bucket = getStorage().bucket("uftb-smartbus-dev.appspot.com");
    const file = bucket.file(`photos/${requestId}.jpg`);
    
    await file.save(buffer, { metadata: { contentType: "image/jpeg" } });

    await db.collection("capturePhotoRequests").doc(requestId).update({
      status: "STORED", uploadedAt: new Date().toISOString()
    });

    res.status(200).json({ message: "Photo saved to storage" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 15. Admin Sends Voice Message
// ==========================================
router.post("/audio/send", async (req: Request, res: Response) => {
  try {
    const { busId, audioBase64 } = req.body;
    const base64Data = audioBase64.replace(/^data:audio\/webm;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const bucket = getStorage().bucket("uftb-smartbus-dev.appspot.com");
    const fileName = `audio/${Date.now()}.webm`;
    const file = bucket.file(fileName);
    
    await file.save(buffer, { metadata: { contentType: "audio/webm" } });

    const topic = `smartbus/${busId}/audio`;
    mqttClient.publish(topic, JSON.stringify({ action: "PLAY_AUDIO", url: fileName }));

    res.status(200).json({ message: "Audio sent to bus" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 16. Bus Uploads Audio to Admin
// ==========================================
router.post("/audio/upload", async (req: Request, res: Response) => {
  try {
    const { busId, audioBase64 } = req.body;
    const base64Data = audioBase64.replace(/^data:audio\/wav;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const bucket = getStorage().bucket("uftb-smartbus-dev.appspot.com");
    const fileName = `bus-audio/${busId}-${Date.now()}.wav`;
    const file = bucket.file(fileName);
    
    await file.save(buffer, { metadata: { contentType: "audio/wav" } });
    await db.collection("busVoiceInbox").add({
      busId, fileName, uploadedAt: new Date().toISOString(),
    });

    res.status(200).json({ message: "Audio uploaded to admin" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;