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
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [latestRequest, setLatestRequest] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const { user } = useAuth();
  
  const BUS_ID = "BUS-01";

  // Listen to active trip status
  useEffect(() => {
    const q = query(collection(db, "trips"), where("busId", "==", BUS_ID), where("status", "==", "IN_PROGRESS"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setTripActive(true);
        setActiveTripId(snapshot.docs[0].id);
      } else {
        setTripActive(false);
        setActiveTripId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to attendance events for the active trip
  useEffect(() => {
    if (!activeTripId) {
      setEvents([]);
      return;
    }
    const q = query(collection(db, "tripAttendance"), where("tripId", "==", activeTripId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const evList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(evList);
    });
    return () => unsubscribe();
  }, [activeTripId]);

  // Listen for Student Requests
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
            <p style={{ margin: 0, fontWeight: "bold", fontSize: 18 }}>{latestRequest.message}</p>
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

            {tripActive && (
              <div style={{ marginTop: 24, padding: 16, background: "#dcfce7", borderRadius: 8, color: "#166534", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981" }}></span>
                Trip is ACTIVE. {events.length} passengers scanned.
              </div>
            )}
          </div>
          
          <h3>Live Map</h3>
          <LiveMap />
        </div>
      )}

      {activeTab === "trips" && (
        <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Passenger List (Active Trip)</h2>
          {!tripActive ? (
            <p>No active trip. Start a trip to see passengers.</p>
          ) : events.length === 0 ? (
            <p>Waiting for students to scan their RFID cards...</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", fontSize: 14, color: "#64748b" }}>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Time</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Card UID</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Event</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "16px 24px", color: "#64748b" }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                    <td style={{ padding: "16px 24px", fontWeight: "bold" }}>{ev.uid}</td>
                    <td style={{ padding: "16px 24px" }}>
                      <span style={{ background: ev.type === "BOARDING" ? "#dbeafe" : "#fce7f3", color: ev.type === "BOARDING" ? "#1e40af" : "#9d174d", padding: "4px 8px", borderRadius: 12, fontSize: 12, fontWeight: "bold" }}>{ev.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Layout>
  );
}