import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";

// Fix Leaflet icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const db = getFirestore();
connectFirestoreEmulator(db, "127.0.0.1", 8080);

export default function LiveMap() {
  const [busData, setBusData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);

  const defaultCenter: [number, number] = [24.065111, 90.222806];

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "buses", "BUS-01"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().lastLocation) {
        setBusData(docSnap.data().lastLocation);
      } else {
        setBusData(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Check for stale data every 1 second
  useEffect(() => {
    if (!busData || !busData.updatedAt) return;
    
    const interval = setInterval(() => {
      const lastUpdate = new Date(busData.updatedAt).getTime();
      const now = new Date().getTime();
      const ageSeconds = (now - lastUpdate) / 1000;
      
      // If data is older than 15 seconds, mark as stale
      if (ageSeconds > 15) {
        setIsStale(true);
      } else {
        setIsStale(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [busData]);

  if (loading) return <div style={{ padding: 20 }}>Loading Map...</div>;

  // If we have data, center on it. Otherwise, center on UFTB.
  const center: [number, number] = busData ? [busData.lat, busData.lng] : defaultCenter;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      
      {/* 1. NO DATA AT ALL */}
      {!busData && (
        <div style={{ background: "#fef3c7", padding: "16px", marginBottom: 16, borderRadius: 8, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, fontWeight: "bold", color: "#b45309", border: "1px solid #f59e0b" }}>
          ⚠️ Waiting for bus to send GPS data...
        </div>
      )}

      {/* 2. LIVE DATA (Recent) */}
      {busData && !isStale && (
        <div style={{ background: "#dcfce7", padding: "12px 24px", marginBottom: 16, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", color: "#166534", border: "1px solid #10b981" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981" }}></span>
            BUS-01 is {busData.status}
          </div>
          <div style={{ fontSize: 13, color: "#065f46" }}>
            Live Update: {new Date(busData.updatedAt).toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* 3. STALE DATA (Older than 15s) */}
      {busData && isStale && (
        <div style={{ background: "#fee2e2", padding: "12px 24px", marginBottom: 16, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", color: "#991b1b", border: "1px solid #ef4444" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444" }}></span>
            GPS OFFLINE - Last known location
          </div>
          <div style={{ fontSize: 13, color: "#7f1d1d" }}>
            Last Seen: {new Date(busData.updatedAt).toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* MAP */}
      <div style={{ height: "600px", width: "100%", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
        <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {busData && (
            <Marker position={center}>
              <Popup>
                <strong>BUS-01</strong><br />
                Status: {isStale ? "OFFLINE" : busData.status}<br />
                Speed: {busData.speed} km/h<br />
                Last Update: {new Date(busData.updatedAt).toLocaleTimeString()}
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}