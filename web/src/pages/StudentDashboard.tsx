import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { MapPin, Navigation } from "lucide-react";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

const db = getFirestore();
connectFirestoreEmulator(db, "127.0.0.1", 8080);

export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [requestStatus, setRequestStatus] = useState("");
  const [busData, setBusData] = useState<any>(null);
  const [locationName, setLocationName] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "buses", "BUS-01"), (docSnap) => {
      if (docSnap.exists()) setBusData(docSnap.data().lastLocation);
    });
    return () => unsub();
  }, []);

  const sendRequest = async (locationText: string) => {
    setRequestStatus("Sending...");
    try {
      const message = `ami ${locationText} te achi`;
      const res = await fetch("http://localhost:5000/api/trips/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busId: "BUS-01", message: message })
      });
      
      if (res.ok) {
        setRequestStatus(`✅ Sent: "${message}"`);
        setTimeout(() => setRequestStatus(""), 4000);
      }
    } catch (err) {
      setRequestStatus("❌ Failed to send request");
    }
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      setRequestStatus("Getting GPS...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude.toFixed(4);
          const lng = position.coords.longitude.toFixed(4);
          sendRequest(`GPS (${lat}, ${lng})`);
        },
        () => {
          setRequestStatus("❌ GPS failed. Please enter manually.");
        }
      );
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      
      {activeTab === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            
            {/* BUS STATUS */}
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <h3 style={{ marginTop: 0 }}>My Bus Status</h3>
              <p>Bus: <strong>BUS-01</strong></p>
              <p>
                Status: {busData ? (
                  <span style={{ color: busData.speed > 2 ? "#10b981" : "#f59e0b", fontWeight: "bold" }}>{busData.status}</span>
                ) : (
                  <span style={{ color: "#ef4444", fontWeight: "bold" }}>Offline</span>
                )}
              </p>
              <p>Last Update: {busData ? new Date(busData.updatedAt).toLocaleTimeString() : "No data"}</p>
            </div>

            {/* QUICK ACTIONS */}
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <h3 style={{ marginTop: 0 }}>Request Bus Stop</h3>
              {requestStatus && <p style={{ color: "green", fontWeight: "bold" }}>{requestStatus}</p>}
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input 
                  type="text" 
                  placeholder="Enter location (max 20 chars)" 
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  maxLength={20} 
                  style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
                />
                <button 
                  onClick={() => {
                    if (locationName.trim() === "") return alert("Please enter a location");
                    sendRequest(locationName);
                    setLocationName("");
                  }}
                  style={{ padding: 12, background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}
                >
                  Send Stop Request
                </button>

                <div style={{ textAlign: "center", color: "#64748b", margin: "4px 0" }}>- OR -</div>

                <button 
                  onClick={getLocation}
                  style={{ padding: 12, background: "#10b981", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  <Navigation size={18} /> Share My GPS Location
                </button>
              </div>
            </div>
          </div>

          <h3>Live Location</h3>
          <LiveMap />
        </div>
      )}

      {activeTab === "map" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Live Bus Location</h3>
          <LiveMap />
        </div>
      )}
    </Layout>
  );
}