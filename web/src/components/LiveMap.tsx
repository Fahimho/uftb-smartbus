import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getFirestore, doc, onSnapshot, collection, query, where } from "firebase/firestore";
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
  const [history, setHistory] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  
  // NEW: Prevents the green banner flash on mount
  const [checking, setChecking] = useState(true); 

  const defaultCenter: [number, number] = [24.065111, 90.222806];

  // 1. Listen to current location
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "buses", "BUS-01"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().lastLocation) {
        const data = docSnap.data().lastLocation;
        setBusData(data);
        
        // Calculate staleness IMMEDIATELY when data arrives
        const ageSeconds = (new Date().getTime() - new Date(data.updatedAt).getTime()) / 1000;
        setIsStale(ageSeconds > 15);
      } else {
        setBusData(null);
        setIsStale(false);
      }
      
      // Finish checking once data (or lack thereof) is loaded
      setChecking(false);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Listen to the GPS history
  useEffect(() => {
    const q = query(collection(db, "gpsHistory"), where("busId", "==", "BUS-01"));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data());
      docs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const points: [number, number][] = docs.map(data => [Number(data.lat), Number(data.lng)]);
      setHistory(points);
    });
    return () => unsub();
  }, []);

  // 3. Timer check for staleness
  useEffect(() => {
    if (!busData || !busData.updatedAt) return;
    
    const interval = setInterval(() => {
      const lastUpdate = new Date(busData.updatedAt).getTime();
      const now = new Date().getTime();
      setIsStale((now - lastUpdate) / 1000 > 15);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [busData]);

  if (loading) return <div style={{ padding: 20 }}>Loading Map...</div>;

  const center: [number, number] = busData ? [busData.lat, busData.lng] : defaultCenter;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      
      {/* 1. NO DATA AT ALL */}
      {!busData && (
        <div style={{ background: "#fef3c7", padding: "16px", marginBottom: 16, borderRadius: 8, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, fontWeight: "bold", color: "#b45309", border: "1px solid #f59e0b" }}>
          ⚠️ Waiting for bus to send GPS data...
        </div>
      )}

      {/* 2. LIVE DATA (Only show if we finished checking AND it's not stale) */}
      {busData && !isStale && !checking && (
        <div style={{ background: "#dcfce7", padding: "12px 24px", marginBottom: 16, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", color: "#166534", border: "1px solid #10b981" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981" }}></span>
            BUS-01 is {busData.status}
          </div>
          <div style={{ fontSize: 13, color: "#065f46" }}>Live Update: {new Date(busData.updatedAt).toLocaleTimeString()}</div>
        </div>
      )}

      {/* 3. STALE DATA (Older than 15s) */}
      {busData && isStale && !checking && (
        <div style={{ background: "#fee2e2", padding: "12px 24px", marginBottom: 16, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", color: "#991b1b", border: "1px solid #ef4444" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444" }}></span>
            GPS OFFLINE - Last known location
          </div>
          <div style={{ fontSize: 13, color: "#7f1d1d" }}>Last Seen: {new Date(busData.updatedAt).toLocaleTimeString()}</div>
        </div>
      )}

      {/* MAP */}
      <div style={{ height: "600px", width: "100%", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
        <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {history.length > 1 && (
            <Polyline positions={history} color="blue" weight={5} opacity={0.8} />
          )}

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