import { useState } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { useAuth } from "../context/AuthContext";

export default function GuestDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { user } = useAuth();

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      
      {activeTab === "dashboard" && (
        <div>
          {/* WELCOME HEADER */}
          <div style={{ background: "white", padding: 32, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)", marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Welcome, {user?.displayName || "Guest"}</h2>
            <p style={{ color: "#64748b" }}>
              You are currently viewing the UFTB SmartBus system in <strong>Guest Mode</strong>. 
              You have read-only access to view live bus locations during this event. Admin and Operator features are restricted.
            </p>
          </div>

          {/* LIVE MAP */}
          <h3>Event Live Location</h3>
          <LiveMap />
        </div>
      )}

    </Layout>
  );
}