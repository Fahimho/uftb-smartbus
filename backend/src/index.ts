import "./firebase.js"; // <-- Use .js here
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js"; // <-- Use .js here
const app = express();
const PORT = process.env.BACKEND_PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);

app.listen(PORT, () => {
  console.log("========================================");
  console.log(`UFTB SmartBus Backend running on http://localhost:${PORT}`);
  console.log("Connected to Local Firebase Emulators");
  console.log("========================================");
});