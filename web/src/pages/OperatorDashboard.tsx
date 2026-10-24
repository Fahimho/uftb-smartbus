import { useState } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";

export default function OperatorDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [tripActive, setTripActive] = useState(false);

  const toggleTrip = () => {
    setTripActive(!tripActive);
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === "dashboard" && (
        <div>
          <div style={{ background: "white", padding: 32, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)", marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Operator Controls</h2>
            <p>Bus Assignment: <strong>BUS-01</strong></p>
            
            <button 
              onClick={toggleTrip}
              style={{ 
                padding: "16px 32px", fontSize: 18, fontWeight: "bold", borderRadius: 8, border: "none", cursor: "pointer",
                background: tripActive ? "#ef4444" : "#10b981", color: "white", marginTop: 16
              }}
            >
              {tripActive ? "END TRIP" : "START TRIP"}
            </button>

            {tripActive && (
              <div style={{ marginTop: 24, padding: 16, background: "#dcfce7", borderRadius: 8, color: "#166534", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981" }}></span>
                Trip is currently ACTIVE. RFID Scanner is ready.
              </div>
            )}
          </div>
          
          <h3>Live Map</h3>
          <LiveMap />
        </div>
      )}

      {activeTab === "trips" && (
        <div style={{ background: "white", padding: 48, borderRadius: 12, textAlign: "center" }}>
          <h2>Passenger List</h2>
          <p>Students who have scanned their cards will appear here.</p>
        </div>
      )}
    </Layout>
  );
}