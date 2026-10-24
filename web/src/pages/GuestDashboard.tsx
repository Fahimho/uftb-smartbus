import { useState } from "react";
import Layout from "../components/Layout";

export default function GuestDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
        <h2>Welcome, Event Guest</h2>
        <p>You have limited access to the live map during this event.</p>
        <p>Admin features are restricted.</p>
      </div>
    </Layout>
  );
}