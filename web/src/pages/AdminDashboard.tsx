import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { AlertTriangle, Map as MapIcon, X, Camera } from "lucide-react";
import { getFirestore, collection, onSnapshot, query, where } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { connectStorageEmulator } from "firebase/storage";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const db = getFirestore();
connectFirestoreEmulator(db, "127.0.0.1", 8080);

const storage = getStorage();
connectStorageEmulator(storage, "127.0.0.1", 9199);

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [events, setEvents] = useState<any[]>([]);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [openMapFor, setOpenMapFor] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "tripAttendance"), (snapshot) => {
      const eventList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(eventList);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "emergencyEvents"), where("status", "==", "ACTIVE"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEmergencies(list);
    });
    return () => unsub();
  }, []);

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      
      {activeTab === "dashboard" && (
        <div>
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
              <h2 style={{ margin: "8px 0 0 0", fontSize: 32, color: emergencies.length > 0 ? "#ef4444" : "#10b981" }}>{emergencies.length}</h2>
            </div>
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 500 }}>System Status</p>
              <h2 style={{ margin: "8px 0 0 0", fontSize: 20, color: "#10b981", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#10b981" }}></span> Online
              </h2>
            </div>
          </div>

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

      {activeTab === "emergency" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Active Emergencies</h3>
          {emergencies.length === 0 ? (
            <div style={{ background: "white", padding: 48, borderRadius: 12, textAlign: "center", color: "#64748b" }}>
              <h2>No active emergencies</h2>
              <p>All buses are safe.</p>
            </div>
          ) : (
            emergencies.map(em => (
              <div key={em.id} style={{ background: "#fee2e2", border: "1px solid #ef4444", padding: 24, borderRadius: 12, marginBottom: 24 }}>
                <h3 style={{ margin: 0, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertTriangle /> EMERGENCY: {em.busId}
                </h3>
                <p style={{ margin: "8px 0" }}><strong>Time:</strong> {new Date(em.timestamp).toLocaleString()}</p>
                
                <div style={{ background: "white", padding: 12, borderRadius: 6, marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 14, color: "#b91c1c" }}>
                    <strong>Alert Delivery:</strong> Cellular notification is not configured or has not been verified.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <button 
                    onClick={async () => {
                      await fetch(`http://localhost:5000/api/trips/emergency/${em.id}/resolve`, { method: "POST" });
                    }}
                    style={{ padding: "10px 20px", background: "#10b981", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
                  >
                    Acknowledge & Resolve
                  </button>
                  
                  <button 
                    onClick={() => setOpenMapFor(openMapFor === em.id ? null : em.id)}
                    style={{ padding: "10px 20px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {openMapFor === em.id ? <><X size={18}/> Close Map</> : <><MapIcon size={18}/> View on Map</>}
                  </button>
                </div>

                {openMapFor === em.id && em.lat !== 0 && em.lng !== 0 && (
                  <div style={{ height: 300, marginTop: 16, borderRadius: 8, overflow: "hidden" }}>
                    <MapContainer center={[em.lat, em.lng]} zoom={16} style={{ height: "100%", width: "100%" }}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={[em.lat, em.lng]}>
                        <Popup>Emergency Location</Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                )}
                {openMapFor === em.id && (em.lat === 0 || em.lng === 0) && (
                  <div style={{ marginTop: 16, padding: 16, background: "white", borderRadius: 8, color: "#ef4444" }}>
                    No GPS coordinates available for this emergency.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "map" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Live Fleet Map</h3>
          <LiveMap />
        </div>
      )}

      {activeTab === "camera" && (
        <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Capture Photo</h2>
          <p>Request a live image from the bus camera.</p>
          
          <button 
            onClick={async () => {
              await fetch("http://localhost:5000/api/trips/photo/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busId: "BUS-01" }) });
              alert("Capture command sent to bus!");
            }}
            style={{ padding: "12px 24px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}
          >
            <Camera size={18} /> Trigger Camera
          </button>

          <div style={{ marginTop: 32 }}>
            <CameraViewer />
          </div>
        </div>
      )}

      {activeTab !== "dashboard" && activeTab !== "map" && activeTab !== "emergency" && activeTab !== "camera" && (
        <div style={{ background: "white", padding: 48, borderRadius: 12, textAlign: "center", color: "#64748b" }}>
          <h2>Feature in development</h2>
        </div>
      )}
    </Layout>
  );
}

function CameraViewer() {
  const [photo, setPhoto] = useState<any>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "capturePhotoRequests"), where("status", "==", "STORED"));
    const unsub = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const sorted = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        const latestPhoto = sorted[0] as any;
        setPhoto(latestPhoto);

        try {
          const url = await getDownloadURL(ref(storage, `photos/${latestPhoto.id}.jpg`));
          setImageUrl(url);
        } catch (err) {
          console.error("Error fetching image:", err);
        }
      }
    });
    return () => unsub();
  }, []);

  if (!photo) return <p style={{ color: "#64748b" }}>Waiting for photo...</p>;

  return (
    <div style={{ background: "#f8fafc", padding: 24, borderRadius: 12, border: "1px solid #e2e8f0" }}>
      <p style={{ margin: "0 0 8px 0" }}><strong>Status:</strong> {photo.status}</p>
      <p style={{ margin: "0 0 16px 0" }}><strong>Time:</strong> {new Date(photo.uploadedAt).toLocaleTimeString()}</p>
      {imageUrl ? (
        <img src={imageUrl} alt="Bus Capture" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #ccc" }} />
      ) : (
        <p>Loading image...</p>
      )}
    </div>
  );
}