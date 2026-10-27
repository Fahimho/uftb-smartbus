import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getFirestore, doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { useAuth } from '../context/AuthContext';

// 1. Fix Leaflet Default Icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const db = getFirestore();
connectFirestoreEmulator(db, "127.0.0.1", 8080);

// Custom Zoom Controls inside the map
function CustomZoomControls() {
  const map = useMap();
  return (
    <div style={{ position: "absolute", top: 60, right: 12, zIndex: 1000, display: "flex", flexDirection: "column", gap: 8 }}>
      <button 
        onClick={() => map.zoomIn()} 
        style={{ width: 36, height: 36, background: "white", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 20, fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
      >
        +
      </button>
      <button 
        onClick={() => map.zoomOut()} 
        style={{ width: 36, height: 36, background: "white", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 20, fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
      >
        -
      </button>
    </div>
  );
}

export default function LiveMap({ userRole = "operator" }: { userRole?: string }) {
  const { user } = useAuth();
  const [busData, setBusData] = useState<any>(null);
  const [history, setHistory] = useState<[number, number][]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [checking, setChecking] = useState(true); 

  const defaultCenter: [number, number] = [24.065111, 90.222806];

  const busIcon = new L.DivIcon({
    html: `<div style="font-size: 24px;">🚌</div>`,
    className: 'bus-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  const studentIcon = new L.DivIcon({
    html: `<div style="background-color: #10b981; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    className: 'student-icon',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  // 1. Listen to Bus Location
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "buses", "BUS-01"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().lastLocation) {
        const data = docSnap.data().lastLocation;
        setBusData(data);
        const ageSeconds = (new Date().getTime() - new Date(data.updatedAt).getTime()) / 1000;
        setIsStale(ageSeconds > 15);
      } else {
        setBusData(null);
        setIsStale(false);
      }
      setChecking(false);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Listen to GPS History
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

  // 3. Listen to Student Requests
  useEffect(() => {
    const q = query(collection(db, "busRequests"), where("busId", "==", "BUS-01"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => d.data())
        .filter(r => r.lat !== undefined && r.lng !== undefined);
      setRequests(list);
    });
    return () => unsub();
  }, []);

  // 4. Listen to Attendance
  useEffect(() => {
    const q = query(collection(db, "tripAttendance"), where("busId", "==", "BUS-01"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => d.data());
      setAttendance(list);
    });
    return () => unsub();
  }, []);

  // 5. Stale data checker
  useEffect(() => {
    if (!busData || !busData.updatedAt) return;
    const interval = setInterval(() => {
      const lastUpdate = new Date(busData.updatedAt).getTime();
      const now = new Date().getTime();
      setIsStale((now - lastUpdate) / 1000 > 15);
    }, 1000);
    return () => clearInterval(interval);
  }, [busData]);

  const calcDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(2);
  };

  if (loading) return <div style={{ padding: 20 }}>Loading Map...</div>;
  const center: [number, number] = busData ? [busData.lat, busData.lng] : defaultCenter;
  const isOperator = userRole === "operator" || userRole === "admin";

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      
      {/* STICKY BANNER - Sticks to top of scroll container */}
      <div style={{ 
        position: "sticky", 
        top: 0, 
        zIndex: 1000, 
        background: "#f3f4f6", 
        padding: "16px 32px", 
      }}>
        {!busData && (
          <div style={{ background: "#fef3c7", padding: "16px", borderRadius: 8, textAlign: "center", fontWeight: "bold", color: "#b45309", border: "1px solid #f59e0b" }}>
            ⚠️ Waiting for bus to send GPS data...
          </div>
        )}
        {busData && !isStale && !checking && (
          <div style={{ background: "#dcfce7", padding: "12px 24px", borderRadius: 8, display: "flex", justifyContent: "space-between", fontWeight: "bold", color: "#166534", border: "1px solid #10b981" }}>
            <span>🟢 BUS-01 is {busData.status}</span>
            <span>Live: {new Date(busData.updatedAt).toLocaleTimeString()}</span>
          </div>
        )}
        {busData && isStale && !checking && (
          <div style={{ background: "#fee2e2", padding: "12px 24px", borderRadius: 8, display: "flex", justifyContent: "space-between", fontWeight: "bold", color: "#991b1b", border: "1px solid #ef4444" }}>
            <span>🔴 GPS OFFLINE - Last known location</span>
            <span>Last Seen: {new Date(busData.updatedAt).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* MAP */}
      <div style={{ padding: "0 32px 32px 32px" }}>
        <div style={{ position: "relative", height: "600px", width: "100%", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
          <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            <CustomZoomControls />

            {history.length > 1 && <Polyline positions={history} color="#3b82f6" weight={5} opacity={0.8} />}

            {busData && (
              <Marker position={center} icon={isOperator ? busIcon : DefaultIcon}>
                <Popup>
                  <strong>BUS-01</strong><br />
                  Status: {isStale ? "OFFLINE" : busData.status}<br />
                  Speed: {busData.speed} km/h
                </Popup>
              </Marker>
            )}

            {requests.map((req, idx) => {
              const isSelf = req.studentName === user?.displayName;
              const distanceNum = busData ? Number(calcDistance(busData.lat, busData.lng, req.lat, req.lng)) : 999;
              const busIsHere = distanceNum < 0.05 && busData?.speed < 2;
              const hasBoarded = attendance.some(
                (att) => att.studentName === req.studentName && att.type === "BOARDING"
              );
              
              if (hasBoarded || busIsHere) return null;
              if (!isOperator && !isSelf) return null;

              return (
                <React.Fragment key={idx}>
                  {busData && (
                    <Polyline 
                      positions={[[busData.lat, busData.lng], [req.lat, req.lng]]} 
                      color="#10b981" 
                      weight={3} 
                      dashArray="5, 10" 
                    />
                  )}
                  
                  <Marker position={[req.lat, req.lng]} icon={isOperator ? studentIcon : DefaultIcon}>
                    <Popup>
                      <strong>{req.studentName}</strong><br />
                      Message: {req.message}<br />
                      <strong>Distance:</strong> {distanceNum} km
                    </Popup>
                  </Marker>
                </React.Fragment>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}