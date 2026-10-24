import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { getFirestore, collection, onSnapshot, query, where } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { Bell } from "lucide-react";

const db = getFirestore();
connectFirestoreEmulator(db, "127.0.0.1", 8080);

export default function OperatorDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [tripActive, setTripActive] = useState(false);
  const [latestRequest, setLatestRequest] = useState<any>(null);
  const { user } = useAuth();
  
  const BUS_ID = "BUS-01";

  useEffect(() => {
    const q = query(collection(db, "trips"), where("busId", "==", BUS_ID), where("status", "==", "IN_PROGRESS"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTripActive(!snapshot.empty);
    });
    return () => unsubscribe();
  }, []);

  // Listen for Requests
  useEffect(() => {
    const q = query(collection(db, "busRequests"), where("busId", "==", BUS_ID), where("status", "==", "PENDING"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setLatestRequest(snapshot.docs[0].data());
      } else {
        setLatestRequest(null);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      
      {/* POPUP ALERT FOR REQUEST */}
      {latestRequest && (
        <div style={{ position: "fixed", top: 24, right: 24, background: "#fef3c7", border: "2px solid #f59e0b", padding: 24, borderRadius: 12, boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", zIndex: 1000, display: "flex", alignItems: "center", gap: 16 }}>
          <Bell size={32} color="#d97706" />
          <div>
            <h3 style={{ margin: 0, color: "#b45309" }}>New Request</h3>
            <p style={{ margin: 0, fontWeight: "bold" }}>{latestRequest.message}</p>
          </div>
        </div>
      )}

      {activeTab === "dashboard" && (
        <div>
          <div style={{ background: "white", padding: 32, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)", marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Operator Controls</h2>
            <p>Bus Assignment: <strong>{BUS_ID}</strong></p>
            
            <button 
              onClick={async () => {
                if (tripActive) {
                  await fetch("http://localhost:5000/api/trips/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busId: BUS_ID }) });
                } else {
                  await fetch("http://localhost:5000/api/trips/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busId: BUS_ID, operatorUid: user?.uid }) });
                }
              }}
              style={{ padding: "16px 32px", fontSize: 18, fontWeight: "bold", borderRadius: 8, border: "none", cursor: "pointer", background: tripActive ? "#ef4444" : "#10b981", color: "white", marginTop: 16 }}
            >
              {tripActive ? "END TRIP" : "START TRIP"}
            </button>
          </div>
          <LiveMap />
        </div>
      )}
    </Layout>
  );
}