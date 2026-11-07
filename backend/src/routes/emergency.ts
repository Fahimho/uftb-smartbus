import { Router } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { mqttClient } from "../index.ts";

const router = Router();
const db = getFirestore();

// 1. Save contacts and send to ESP32
router.post("/contacts", async (req, res) => {
    const { busId, numbers } = req.body; // numbers is an array of strings
    
    if (!busId || !numbers || !Array.isArray(numbers)) {
        return res.status(400).json({ error: "Missing busId or numbers array" });
    }

    try {
        // Save to Firestore (so it survives restarts)
        await db.collection("busConfig").doc(busId).set({ emergencyContacts: numbers }, { merge: true });

        // Publish to ESP32 via MQTT
        const topic = `smartbus/${busId}/contacts`;
        const payload = JSON.stringify({ numbers });
        
        mqttClient.publish(topic, payload, (err) => {
            if (err) return res.status(500).json({ error: "MQTT failed" });
            res.json({ status: "Contacts saved and sent to bus." });
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to save contacts" });
    }
});

// 2. Get contacts (for Web UI to load on refresh)
router.get("/contacts/:busId", async (req, res) => {
    try {
        const doc = await db.collection("busConfig").doc(req.params.busId).get();
        if (!doc.exists) return res.json({ numbers: [] });
        res.json({ numbers: doc.data()?.emergencyContacts || [] });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch contacts" });
    }
});

// 3. Receive emergency alert from ESP32
router.post("/alert", async (req, res) => {
    const { busId, lat, lng } = req.body;
    
    try {
        // CHANGED: Capture the document reference so we can send the ID back
        const docRef = await db.collection("emergencyEvents").add({
            busId,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            timestamp: new Date().toISOString(),
            status: "ACTIVE",
            deliveryState: "modem_accepted"
        });
        
        // Return the eventId to the ESP32
        res.status(201).json({ status: "Alert saved", eventId: docRef.id });
    } catch (error) {
        res.status(500).json({ error: "Failed to save alert" });
    }
});

// 4. Admin triggers a call to the bus
router.post("/call-bus", async (req, res) => {
    const { busId, phoneNumber } = req.body;
    if (!busId || !phoneNumber) return res.status(400).json({ error: "Missing data" });

    const topic = `smartbus/${busId}/commands`;
    const payload = JSON.stringify({ action: "WAKE_AND_CALL", phoneNumber: phoneNumber });

    mqttClient.publish(topic, payload, (err) => {
        if (err) return res.status(500).json({ error: "MQTT failed" });
        res.json({ status: "Command sent" });
    });
});

// 5. NEW: Webhook for ESP32 to report SMS/Call status
router.post("/alert-status", async (req, res) => {
    const { eventId, status } = req.body;
    
    if (!eventId || !status) {
        return res.status(400).json({ error: "Missing eventId or status" });
    }

    try {
        await db.collection("emergencyEvents").doc(eventId).update({
            deliveryState: status
        });
        res.json({ status: "Delivery state updated successfully" });
    } catch (error) {
        console.error("Webhook update failed:", error);
        res.status(500).json({ error: "Failed to update delivery state" });
    }
});

export default router;