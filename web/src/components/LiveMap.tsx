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

  // Default center (UFTB Campus) if no GPS data exists yet
  const defaultCenter: [number, number] = [24.065111, 90.222806];

  useEffect(() => {
    // Listen to the 'buses' collection for BUS-01
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

  if (loading) return <div style={{ padding: 20 }}>Loading Map...</div>;

  const center: [number, number] = busData ? [busData.lat, busData.lng] : defaultCenter;

  return (
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
              Status: {busData.status}<br />
              Speed: {busData.speed} km/h<br />
              Last Update: {new Date(busData.updatedAt).toLocaleTimeString()}
            </Popup>
          </Marker>
        )}
      </MapContainer>
      
      {!busData && (
        <div style={{ position: "absolute", top: 10, left: 50, background: "white", padding: 10, borderRadius: 8, zIndex: 1000, boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>
          ⚠️ Waiting for bus to send GPS data...
        </div>
      )}
    </div>
  );
}