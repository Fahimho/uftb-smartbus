import { useState } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";

export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");

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
              <button style={{ width: "100%", padding: 12, marginBottom: 12, background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
                Request Stop at Next Station
              </button>
              <button style={{ width: "100%", padding: 12, background: "#f59e0b", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
                Request Assistance
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
