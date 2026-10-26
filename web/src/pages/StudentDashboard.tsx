import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { Navigation } from "lucide-react";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const db = getFirestore();
connectFirestoreEmulator(db, "127.0.0.1", 8080);

export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [busData, setBusData] = useState<any>(null);
  const [isStale, setIsStale] = useState(false);
  const [locationName, setLocationName] = useState("");
  const { user } = useAuth();

  // 1. DATABASE LISTENER (Live GPS)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "buses", "BUS-01"), (docSnap) => {
      if (docSnap.exists()) setBusData(docSnap.data().lastLocation);
      else setBusData(null);
    });
    return () => unsub();
  }, []);

  // 2. STALE DATA CHECKER (15 Seconds)
  useEffect(() => {
    if (!busData || !busData.updatedAt) return;
    const interval = setInterval(() => {
      const ageSeconds = (new Date().getTime() - new Date(busData.updatedAt).getTime()) / 1000;
      setIsStale(ageSeconds > 15);
    }, 1000);
    return () => clearInterval(interval);
  }, [busData]);

  // 3. SEND REQUEST (Includes optional lat/lng)
  const sendRequest = async (message: string, lat?: number, lng?: number) => {
    const loadingToast = toast.loading("Sending request to bus...");
    
    try {
      const res = await fetch("http://localhost:5000/api/trips/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          busId: "BUS-01", 
          message: message,
          studentName: user?.displayName || "Student",
          lat: lat,
          lng: lng
        })
      });
      
      if (res.ok) {
        toast.success(`Sent: "${message}"`, { id: loadingToast });
      } else {
        toast.error("Failed to send request.", { id: loadingToast });
      }
    } catch (err) {
      toast.error("Network error. Failed to send.", { id: loadingToast });
    }
  };

  // 4. BROWSER GPS LOCATION (With Reverse Geocoding)
  const getLocation = () => {
    if (navigator.geolocation) {
      const loadingToast = toast.loading("Getting your location...");
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          try {
            // Reverse Geocode using OpenStreetMap (Nominatim)
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            
            let placeName = data.address.suburb || data.address.village || data.address.town || data.address.city || "Unknown";
            if (placeName.length > 20) placeName = placeName.substring(0, 20);

            toast.dismiss(loadingToast);
            sendRequest(`ami ${placeName} achi`, lat, lng);
          } catch (error) {
            toast.dismiss(loadingToast);
            // Fallback if geocoding fails
            sendRequest(`ami location (${lat.toFixed(4)}, ${lng.toFixed(4)}) achi`, lat, lng);
          }
        },
        () => {
          toast.error("GPS failed. Please type your location manually.", { id: loadingToast });
        }
      );
    }
  };

  const handleManualRequest = () => {
    if (locationName.trim() === "") {
      toast.error("Please enter a location first.");
      return;
    }
    sendRequest(`ami ${locationName} achi`);
    setLocationName("");
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      
      {/* ========================================== */}
      {/* DASHBOARD TAB                              */}
      {/* ========================================== */}
      {activeTab === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            
            {/* BUS STATUS SECTION */}
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <h3 style={{ marginTop: 0 }}>My Bus Status</h3>
              <p>Bus: <strong>BUS-01</strong></p>
              <p>
                Status: {busData && !isStale ? (
                  <span style={{ color: busData.speed > 2 ? "#10b981" : "#f59e0b", fontWeight: "bold" }}>{busData.status}</span>
                ) : (
                  <span style={{ color: "#ef4444", fontWeight: "bold" }}>Offline (GPS Lost)</span>
                )}
              </p>
              <p>Last Update: {busData ? new Date(busData.updatedAt).toLocaleTimeString() : "No data"}</p>
            </div>

            {/* QUICK ACTIONS SECTION */}
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <h3 style={{ marginTop: 0 }}>Request Bus Stop</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input 
                  type="text" 
                  placeholder="Enter location (max 20 chars)" 
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  maxLength={20} 
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", outline: "none", fontSize: 14 }}
                />
                <button 
                  onClick={handleManualRequest}
                  style={{ padding: 12, background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 14 }}
                >
                  Send Stop Request
                </button>

                <div style={{ textAlign: "center", color: "#94a3b8", margin: "4px 0", fontSize: 13 }}>- OR -</div>

                <button 
                  onClick={getLocation}
                  style={{ padding: 12, background: "#10b981", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14 }}
                >
                  <Navigation size={18} /> Share My GPS Location
                </button>
              </div>
            </div>
          </div>

          {/* LIVE MAP SECTION */}
          <h3>Live Location</h3>
          <LiveMap userRole="student" />
        </div>
      )}

      {/* ========================================== */}
      {/* MAP TAB                                    */}
      {/* ========================================== */}
      {activeTab === "map" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Live Bus Location</h3>
          <LiveMap userRole="student" />
        </div>
      )}
    </Layout>
  );
}