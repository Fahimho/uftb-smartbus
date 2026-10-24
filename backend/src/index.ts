import "./firebase.ts";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.ts";
import tripRoutes from "./routes/trips.ts";
import mqtt from "mqtt";

const app = express();
const PORT = process.env.BACKEND_PORT || 5000;

// Connect to EMQX Cloud Broker
export const mqttClient = mqtt.connect("mqtts://nf9aa1f2.ala.asia-southeast1.emqxsl.com:8883", {
  username: "SMART-BUS",
  password: "uftbsmartbus@"
});

mqttClient.on("connect", () => {
  console.log("✅ [MQTT] Connected to EMQX Cloud Broker");
});

mqttClient.on("error", (err) => {
  console.error("❌ [MQTT] Error:", err.message);
});

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);

app.listen(PORT, () => {
  console.log("========================================");
  console.log(`UFTB SmartBus Backend running on http://localhost:${PORT}`);
  console.log("========================================");
});