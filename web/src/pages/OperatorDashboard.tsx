import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { getFirestore, collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { Bell, X } from "lucide-react";
import toast from "react-hot-toast";

const db = getFirestore();
connectFirestoreEmulator(db, "127.0.0.1", 8080);

export default function OperatorDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [tripActive, setTripActive] = useState(false);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  
  const [latestRequest, setLatestRequest] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [allRequests, setAllRequests] = useState<any[]>([]);
  
  const [events, setEvents] = useState<any[]>([]);
  const [allTrips, setAllTrips] = useState<any[]>([]);
  const { user } = useAuth();
  
  const [viewingTripId, setViewingTripId] = useState<string | null>(null);
  const [viewingTripEvents, setViewingTripEvents] = useState<any[]>([]);

  const BUS_ID = "BUS-01";

  // 1. Listen to ALL trips for history
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trips"), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      setAllTrips(list);
    });
    return () => unsub();
  }, []);

  // 2. Listen to active trip status
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

  // 3. Listen to attendance events for the ACTIVE trip
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

  // 4. Listen for Student Requests, Save to History, and Auto-Dismiss Popup
  useEffect(() => {
    const q = query(collection(db, "busRequests"), where("busId", "==", BUS_ID));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAllRequests(list);

      const pendingDoc = snapshot.docs.find(d => d.data().status === "PENDING");
      if (pendingDoc) {
        const data = pendingDoc.data();
        setLatestRequest(data);
        setShowPopup(true);
        updateDoc(doc(db, "busRequests", pendingDoc.id), { status: "DELIVERED" });
        setTimeout(() => {
          setShowPopup(false);
          setLatestRequest(null);
        }, 5000);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleViewTrip = (tripId: string) => {
    setViewingTripId(tripId);
    const q = query(collection(db, "tripAttendance"), where("tripId", "==", tripId));
    const unsub = onSnapshot(q, (snapshot) => {
      const evList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setViewingTripEvents(evList);
    });
    return () => unsub();
  };

  const handleToggleTrip = async () => {
    const loadingToast = toast.loading(tripActive ? "Ending trip..." : "Starting trip...");
    try {
      if (tripActive) {
        await fetch("http://localhost:5000/api/trips/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busId: BUS_ID }) });
        toast.success("Trip Ended. GPS trail cleared.", { id: loadingToast });
      } else {
        await fetch("http://localhost:5000/api/trips/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busId: BUS_ID, operatorUid: user?.uid }) });
        toast.success("Trip Started!", { id: loadingToast });
      }
    } catch (err) {
      toast.error("Failed to update trip status.", { id: loadingToast });
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      
      {/* YELLOW POPUP ALERT FOR REQUEST */}
      {showPopup && latestRequest && (
        <div style={{ position: "fixed", top: 24, right: 24, background: "#fef3c7", border: "2px solid #f59e0b", padding: 24, borderRadius: 12, boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", zIndex: 1000, display: "flex", alignItems: "center", gap: 16 }}>
          <Bell size={32} color="#d97706" />
          <div>
            <h3 style={{ margin: 0, color: "#b45309" }}>New Request from {latestRequest.studentName}</h3>
            <p style={{ margin: 0, fontWeight: "bold", fontSize: 18 }}>{latestRequest.message}</p>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* DASHBOARD TAB */}
      {/* ========================================== */}
      {activeTab === "dashboard" && (
        <div>
          <div style={{ background: "white", padding: 32, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)", marginBottom: 24 }}>
            <h2 style={{ marginTop: 0 }}>Operator Controls</h2>
            <p>Bus Assignment: <strong>{BUS_ID}</strong></p>
            
            <button 
              onClick={handleToggleTrip}
              style={{ padding: "16px 32px", fontSize: 18, fontWeight: "bold", borderRadius: 8, border: "none", cursor: "pointer", background: tripActive ? "#ef4444" : "#10b981", color: "white", marginTop: 16, transition: "opacity 0.2s" }}
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

          <div style={{ background: "white", padding: 32, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)", marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Live Passenger List (Current Trip)</h3>
            {!tripActive ? (
              <p style={{ color: "#64748b" }}>No active trip. Start a trip to see passengers.</p>
            ) : events.length === 0 ? (
              <p style={{ color: "#64748b" }}>Waiting for students to scan their RFID cards...</p>
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
          <h3>Live Map</h3>
          <LiveMap />
        </div>
      )}

      {/* ========================================== */}
      {/* TRIPS TAB */}
      {/* ========================================== */}
      {activeTab === "trips" && (
        <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Trip History</h2>
          <p style={{ color: "#64748b" }}>Click on any row to view that trip's attendance.</p>
          
          {allTrips.length === 0 ? (
            <p>No trips found.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", fontSize: 14, color: "#64748b" }}>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Trip ID</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Start Time</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>End Time</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {allTrips.map(trip => (
                  <tr 
                    key={trip.id} 
                    onClick={() => handleViewTrip(trip.id)}
                    style={{ 
                      borderTop: "1px solid #e2e8f0", 
                      cursor: "pointer",
                      background: viewingTripId === trip.id ? "#f0f9ff" : "transparent"
                    }}
                  >
                    <td style={{ padding: "16px 24px", fontWeight: "bold", fontSize: 12 }}>{trip.id}</td>
                    <td style={{ padding: "16px 24px", color: "#64748b" }}>{new Date(trip.startedAt).toLocaleString()}</td>
                    <td style={{ padding: "16px 24px", color: "#64748b" }}>{trip.endedAt ? new Date(trip.endedAt).toLocaleString() : "--"}</td>
                    <td style={{ padding: "16px 24px" }}>
                      <span style={{ background: trip.status === "IN_PROGRESS" ? "#dcfce7" : "#f1f5f9", color: trip.status === "IN_PROGRESS" ? "#166534" : "#475569", padding: "4px 8px", borderRadius: 12, fontSize: 12, fontWeight: "bold" }}>
                        {trip.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewingTripId && (
            <div style={{ marginTop: 32, padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Attendance for {viewingTripId}</h3>
                <button onClick={() => setViewingTripId(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}>
                  <X size={20} />
                </button>
              </div>
              {viewingTripEvents.length === 0 ? (
                <p>No students scanned during this trip.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#e2e8f0", textAlign: "left", fontSize: 14, color: "#475569" }}>
                      <th style={{ padding: "12px 16px", fontWeight: 600 }}>Time</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600 }}>Card UID</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600 }}>Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingTripEvents.map(ev => (
                      <tr key={ev.id} style={{ borderTop: "1px solid #cbd5e1" }}>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                        <td style={{ padding: "12px 16px", fontWeight: "bold" }}>{ev.uid}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ background: ev.type === "BOARDING" ? "#dbeafe" : "#fce7f3", color: ev.type === "BOARDING" ? "#1e40af" : "#9d174d", padding: "4px 8px", borderRadius: 12, fontSize: 12, fontWeight: "bold" }}>{ev.type}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* MESSAGES TAB */}
      {/* ========================================== */}
      {activeTab === "messages" && (
        <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Student Messages</h2>
          {allRequests.length === 0 ? (
            <p>No messages received yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", fontSize: 14, color: "#64748b" }}>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Time</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Student Name</th>
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {allRequests.map(req => (
                  <tr key={req.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "16px 24px", color: "#64748b" }}>{new Date(req.timestamp).toLocaleTimeString()}</td>
                    <td style={{ padding: "16px 24px", fontWeight: "bold" }}>{req.studentName}</td>
                    <td style={{ padding: "16px 24px" }}>{req.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* LIVE MAP TAB */}
      {/* ========================================== */}
      {activeTab === "map" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Live Bus Location</h3>
          <LiveMap />
        </div>
      )}
    </Layout>
  );
}