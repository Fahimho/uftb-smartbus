import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import LiveMap from "../components/LiveMap";

const db = getFirestore();
connectFirestoreEmulator(db, "127.0.0.1", 8080);

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "tripAttendance"), (snapshot) => {
      const eventList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(eventList);
    });
    return () => unsubscribe();
  }, []);

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === "dashboard" && (
        <div>
          {/* STATS CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 32 }}>
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 500 }}>Active Buses</p>
              <h2 style={{ margin: "8px 0 0 0", fontSize: 32, color: "#0f172a" }}>1</h2>
            </div>
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 500 }}>Total Scans Today</p>
              <h2 style={{ margin: "8px 0 0 0", fontSize: 32, color: "#0f172a" }}>{events.length}</h2>
            </div>
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 500 }}>Active Emergencies</p>
              <h2 style={{ margin: "8px 0 0 0", fontSize: 32, color: "#10b981" }}>0</h2>
            </div>
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 500 }}>System Status</p>
              <h2 style={{ margin: "8px 0 0 0", fontSize: 20, color: "#10b981", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981" }}></span> Online
              </h2>
            </div>
          </div>

          {/* RECENT SCANS TABLE */}
          <div style={{ background: "white", borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)", overflow: "hidden" }}>
            <div style={{ padding: 24, borderBottom: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: 0 }}>Recent RFID Scans</h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", fontSize: 14, color: "#64748b" }}>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Time</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>UID</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Type</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Bus</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "16px 24px", color: "#64748b" }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                    <td style={{ padding: "16px 24px", fontWeight: "bold" }}>{ev.uid}</td>
                    <td style={{ padding: "16px 24px" }}>
                      <span style={{ background: "#dbeafe", color: "#1e40af", padding: "4px 8px", borderRadius: 12, fontSize: 12, fontWeight: "bold" }}>{ev.type}</span>
                    </td>
                    <td style={{ padding: "16px 24px" }}>{ev.busId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LIVE MAP TAB */}
      {activeTab === "map" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Live Fleet Map</h3>
          <LiveMap />
        </div>
      )}

      {/* OTHER TABS PLACEHOLDER */}
      {activeTab !== "dashboard" && activeTab !== "map" && (
        <div style={{ background: "white", padding: 48, borderRadius: 12, textAlign: "center", color: "#64748b" }}>
          <h2>Feature in development</h2>
          <p>We will build this in the next steps.</p>
        </div>
      )}
    </Layout>
  );
}