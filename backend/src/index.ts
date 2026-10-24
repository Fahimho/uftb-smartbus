import "./firebase.ts";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.ts";
import tripRoutes from "./routes/trips.ts";

const app = express();
const PORT = process.env.BACKEND_PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/trips", tripRoutes);

app.listen(PORT, () => {
  console.log("========================================");
  console.log(`UFTB SmartBus Backend running on http://localhost:${PORT}`);
  console.log("Connected to Local Firebase Emulators");
  console.log("========================================");
});