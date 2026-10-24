import { useState } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { Bell, MapPin } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [requestStatus, setRequestStatus] = useState("");
  const { user } = useAuth();

  const handleRequest = async () => {
    setRequestStatus("Sending...");
    try {
      const res = await fetch("http://localhost:5000/api/trips/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busId: "BUS-01", message: "STOP AT NEXT STATION" })
      });
      
      if (res.ok) {
        setRequestStatus("✅ Request sent to driver!");
        setTimeout(() => setRequestStatus(""), 3000);
      }
    } catch (err) {
      setRequestStatus("❌ Failed to send request");
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <h3 style={{ marginTop: 0 }}>My Bus Status</h3>
              <p>Bus: <strong>BUS-01</strong></p>
              <p>Status: <span style={{ color: "#10b981", fontWeight: "bold" }}>Moving</span></p>
              <p>ETA: 12 minutes</p>
            </div>

            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <h3 style={{ marginTop: 0 }}>Quick Actions</h3>
              {requestStatus && <p style={{ color: "green", fontWeight: "bold" }}>{requestStatus}</p>}
              
              <button 
                onClick={handleRequest}
                style={{ width: "100%", padding: 12, marginBottom: 12, background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <MapPin size={18} /> Request Stop at Next Station
              </button>
              
              <button 
                style={{ width: "100%", padding: 12, background: "#f59e0b", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <Bell size={18} /> Request Assistance
              </button>
            </div>
          </div>

          <h3>Live Location</h3>
          <LiveMap />
        </div>
      )}
    </Layout>
  );
}