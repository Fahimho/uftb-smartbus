import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { AlertTriangle, Map as MapIcon, X, Camera, Mic, Square, Bus, Trash2, Wifi } from "lucide-react";
import { getFirestore, collection, onSnapshot, query, where, doc, deleteDoc } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { connectStorageEmulator } from "firebase/storage";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import toast from "react-hot-toast";

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
  const [allTrips, setAllTrips] = useState<any[]>([]);
  const [openMapFor, setOpenMapFor] = useState<string | null>(null);
  
  // Buses State
  const [allBuses, setAllBuses] = useState<any[]>([]);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  
  // Map State
  const [mapBusId, setMapBusId] = useState<string>("");
  
  // Camera State
  const [cameraBusId, setCameraBusId] = useState<string>("");
  
  // Audio State
  const [audioBusId, setAudioBusId] = useState<string>("");

  // Fleet Setup Form State
  const [busName, setBusName] = useState("");
  const [busIp, setBusIp] = useState(""); // NEW
  const [route, setRoute] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [helperName, setHelperName] = useState("");
  const [helperPhone, setHelperPhone] = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState<string[]>([]);

  // State for Admin viewing trip attendance
  const [viewingTripId, setViewingTripId] = useState<string | null>(null);
  const [viewingTripEvents, setViewingTripEvents] = useState<any[]>([]);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 1. Listen to Attendance Events
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "tripAttendance"), (snapshot) => {
      const eventList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(eventList);
    });
    return () => unsubscribe();
  }, []);

  // 2. Listen to Emergencies
  useEffect(() => {
    const q = query(collection(db, "emergencyEvents"), where("status", "==", "ACTIVE"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEmergencies(list);
    });
    return () => unsub();
  }, []);

  // 3. Listen to ALL Trips
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "trips"), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      setAllTrips(list);
    });
    return () => unsub();
  }, []);

  // 4. Fetch ALL Buses on mount
  const fetchAllBuses = () => {
    fetch("http://localhost:5000/api/trips/buses")
      .then(res => res.json())
      .then(data => {
        setAllBuses(data);
        if (data.length > 0 && !mapBusId) setMapBusId(data[0].busId);
        if (data.length > 0 && !cameraBusId) setCameraBusId(data[0].busId);
        if (data.length > 0 && !audioBusId) setAudioBusId(data[0].busId);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchAllBuses();
  }, []);

  // 5. Load Fleet Setup when selectedBusId changes
  useEffect(() => {
    if (!selectedBusId) return;
    
    fetch(`http://localhost:5000/api/trips/setup/${selectedBusId}`)
      .then(res => res.json())
      .then(data => {
        if (data.busId) {
          setBusName(data.busName || "");
          setBusIp(data.lastIp || "Waiting for connection..."); // <-- NEW
          setRoute(data.route || "");
          setDriverName(data.driverName || "");
          setDriverPhone(data.driverPhone || "");
          setHelperName(data.helperName || "");
          setHelperPhone(data.helperPhone || "");
          setEmergencyContacts(data.emergencyContacts || [""]);
        } else {
          // If new bus
          setBusName("");
          setBusIp("Waiting for connection..."); // <-- NEW
          setRoute("");
          setDriverName("");
          setDriverPhone("");
          setHelperName("");
          setHelperPhone("");
          setEmergencyContacts([""]);
        }
      })
      .catch(() => setEmergencyContacts([""]));
  }, [selectedBusId]);

  // Save Fleet Setup
  const saveFleetSetup = async () => {
    if (!selectedBusId) return toast.error("No bus selected");
    const filteredNumbers = emergencyContacts.filter(n => n.trim() !== "");
    
    const loading = toast.loading("Saving bus setup...");
    try {
      await fetch("http://localhost:5000/api/trips/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          busId: selectedBusId, 
          busName, 
          route, driverName, driverPhone, helperName, helperPhone, 
          emergencyContacts: filteredNumbers 
        })
      });
      toast.success("Bus setup saved successfully!", { id: loading });
      fetchAllBuses();
    } catch (err) {
      toast.error("Failed to save setup", { id: loading });
    }
  };

  // Auto-generate Bus ID and create
  const handleCreateNewBus = () => {
    let highestNum = 0;
    allBuses.forEach(b => {
      const match = b.busId.match(/BUS-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNum) highestNum = num;
      }
    });
    
    const nextNum = highestNum + 1;
    const newId = `BUS-${String(nextNum).padStart(2, '0')}`;
    
    setSelectedBusId(newId);
    toast.success(`Created new empty bus: ${newId}. Fill details and save.`);
  };

  // Delete a bus
  const handleDeleteBus = async (busId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete ${busId}? This cannot be undone.`)) return;
    
    try {
      await deleteDoc(doc(db, "buses", busId));
      toast.success(`Deleted ${busId}`);
      if (selectedBusId === busId) setSelectedBusId(null);
      fetchAllBuses();
    } catch (err) {
      toast.error("Failed to delete bus");
    }
  };

  // 6. Handle View Trip Attendance
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

  // Audio recording functions
  const startRecording = async () => {
    if (!audioBusId) return toast.error("No bus selected for audio");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          const loadingToast = toast.loading("Sending voice message...");
          try {
            await fetch("http://localhost:5000/api/trips/audio/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ busId: audioBusId, audioBase64: base64Audio })
            });
            toast.success("Voice message sent to bus!", { id: loadingToast });
          } catch (err) {
            toast.error("Failed to send message.", { id: loadingToast });
          }
        };
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      toast.error("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Helper to get bus name
  const getBusName = (busId: string) => {
    const bus = allBuses.find(b => b.busId === busId);
    return bus ? bus.busName || "Unnamed" : busId;
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      
      {/* ========================================== */}
      {/* DASHBOARD TAB */}
      {/* ========================================== */}
      {activeTab === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 32 }}>
            <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 500 }}>Total Buses</p>
              <h2 style={{ margin: "8px 0 0 0", fontSize: 32, color: "#0f172a" }}>{allBuses.length}</h2>
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
            {events.length === 0 ? (
              <p style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No scans yet.</p>
            ) : (
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
                      <td style={{ padding: "16px 24px" }}>{getBusName(ev.busId)} ({ev.busId})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TRIPS & ATTENDANCE TAB */}
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
                  <th style={{ padding: "16px 24px", fontWeight: 600 }}>Bus</th>
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
                    <td style={{ padding: "16px 24px", fontWeight: "bold" }}>{getBusName(trip.busId)} ({trip.busId})</td>
                    <td style={{ padding: "16px 24px", fontSize: 12 }}>{trip.id}</td>
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
                      <th style={{ padding: "12px 16px", fontWeight: 600 }}>Student</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600 }}>Card UID</th>
                      <th style={{ padding: "12px 16px", fontWeight: 600 }}>Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingTripEvents.map(ev => (
                      <tr key={ev.id} style={{ borderTop: "1px solid #cbd5e1" }}>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                        <td style={{ padding: "12px 16px", fontWeight: "bold" }}>{ev.studentName || "Unknown"}</td>
                        <td style={{ padding: "12px 16px" }}>{ev.uid}</td>
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
      {/* EMERGENCY TAB */}
      {/* ========================================== */}
      {activeTab === "emergency" && (
        <div>
          <h3 style={{ marginTop: 0 }}>Active Emergencies</h3>
          {emergencies.length === 0 ? (
            <div style={{ background: "white", padding: 48, borderRadius: 12, textAlign: "center", color: "#64748b" }}>
              <h2>No active emergencies</h2>
              <p>All buses are safe.</p>
            </div>
          ) : (
            emergencies.map(em => {
              const busInfo = allBuses.find(b => b.busId === em.busId);
              return (
                <div key={em.id} style={{ background: "#fee2e2", border: "1px solid #ef4444", padding: 24, borderRadius: 12, marginBottom: 24 }}>
                  <h3 style={{ margin: 0, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertTriangle /> EMERGENCY: {getBusName(em.busId)} ({em.busId})
                  </h3>
                  <p style={{ margin: "8px 0" }}><strong>Time:</strong> {new Date(em.timestamp).toLocaleString()}</p>
                  
                  <div style={{ background: "white", padding: 12, borderRadius: 6, marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: 14, color: "#b91c1c" }}>
                      <strong>Alert Delivery:</strong> {em.deliveryState === "delivered" ? "✅ SMS sent to all contacts and Call connected to Primary." : "Cellular notification is not configured or has not been verified."}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button 
                      onClick={async () => {
                        toast.loading("Resolving...");
                        await fetch(`http://localhost:5000/api/trips/emergency/${em.id}/resolve`, { method: "POST" });
                        toast.success("Emergency resolved");
                        toast.dismiss();
                      }}
                      style={{ padding: "10px 20px", background: "#10b981", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
                    >
                      Acknowledge & Resolve
                    </button>

                    <button 
                      onClick={async () => {
                        if (!busInfo?.driverPhone) return toast.error("Driver number not set in Fleet Setup!");
                        toast.loading("Calling Driver...");
                        await fetch("http://localhost:5000/api/emergency/call-bus", { 
                          method: "POST", 
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ busId: em.busId, phoneNumber: busInfo.driverPhone }) 
                        });
                        toast.success("Call command sent to Driver!", { id: "call" });
                      }}
                      style={{ padding: "10px 20px", background: "#f59e0b", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}
                    >
                      📞 Call Driver ({busInfo?.driverName || "Not Assigned"})
                    </button>

                    <button 
                      onClick={async () => {
                        if (!busInfo?.helperPhone) return toast.error("Helper number not set in Fleet Setup!");
                        toast.loading("Calling Helper...");
                        await fetch("http://localhost:5000/api/emergency/call-bus", { 
                          method: "POST", 
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ busId: em.busId, phoneNumber: busInfo.helperPhone }) 
                        });
                        toast.success("Call command sent to Helper!", { id: "call" });
                      }}
                      style={{ padding: "10px 20px", background: "#f97316", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}
                    >
                      📞 Call Helper ({busInfo?.helperName || "Not Assigned"})
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
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* MANAGE BUSES TAB */}
      {/* ========================================== */}
      {activeTab === "buses" && (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
          
          {/* Bus List Sidebar */}
          <div style={{ background: "white", padding: 24, borderRadius: 12, boxShadow: "0 1px 3px rgb(0 0 0 / 0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Buses</h3>
              <button 
                onClick={handleCreateNewBus} 
                style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13 }}
              >
                + Add Bus
              </button>
            </div>
            {allBuses.map(bus => (
              <div 
                key={bus.busId}
                onClick={() => setSelectedBusId(bus.busId)}
                style={{ 
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: 12, borderRadius: 6, marginBottom: 8, cursor: "pointer", 
                  background: selectedBusId === bus.busId ? "#e2e8f0" : "transparent", 
                  fontWeight: selectedBusId === bus.busId ? "bold" : "normal" 
                }}
              >
                <span>{bus.busName || "Unnamed"} ({bus.busId})</span>
                <Trash2 
                  size={16} 
                  onClick={(e) => handleDeleteBus(bus.busId, e)} 
                  style={{ color: "#ef4444", cursor: "pointer" }} 
                />
              </div>
            ))}
            {allBuses.length === 0 && <p style={{ color: "#64748b", fontSize: 14 }}>No buses yet. Click + to add.</p>}
          </div>

          {/* Setup Form */}
          <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
            {!selectedBusId ? (
              <div style={{ textAlign: "center", color: "#64748b", padding: 48 }}>
                <Bus size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <h2>Select a bus from the left to configure</h2>
              </div>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>Setup: {selectedBusId}</h2>
                
                {/* NEW: Show IP Address */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, marginBottom: 24 }}>
                  <Wifi size={20} color="#166534" />
                  <div>
                    <div style={{ fontSize: 12, color: "#166534", fontWeight: "bold" }}>DEVICE IP ADDRESS</div>
                    <div style={{ fontSize: 16, fontWeight: "bold" }}>{busIp}</div>
                  </div>
                  {busIp !== "Waiting for connection..." && (
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(busIp);
                        toast.success("IP copied to clipboard!");
                      }}
                      style={{ marginLeft: "auto", padding: "6px 12px", background: "#10b981", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}
                    >
                      Copy
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 24, marginBottom: 24, padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ marginTop: 0, color: "#0f172a" }}>Bus Identity & Route</h3>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <input placeholder="Bus Name (e.g. Padma)" value={busName} onChange={e => setBusName(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1", flex: 1, minWidth: 200 }} />
                    <input placeholder="Route (e.g. Kaliakoir to Tongi)" value={route} onChange={e => setRoute(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1", flex: 2, minWidth: 200 }} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div style={{ padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <h3 style={{ marginTop: 0, color: "#0f172a" }}>Bus Driver</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <input placeholder="Driver Name" value={driverName} onChange={e => setDriverName(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} />
                      <input placeholder="Driver Phone (+880...)" value={driverPhone} onChange={e => setDriverPhone(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} />
                    </div>
                  </div>

                  <div style={{ padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <h3 style={{ marginTop: 0, color: "#0f172a" }}>Bus Helper</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <input placeholder="Helper Name" value={helperName} onChange={e => setHelperName(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} />
                      <input placeholder="Helper Phone (+880...)" value={helperPhone} onChange={e => setHelperPhone(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 24, padding: 24, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ marginTop: 0, color: "#0f172a" }}>Emergency Contacts (Admin)</h3>
                  <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>When the emergency button is pressed, an SMS goes to ALL these numbers, and a call goes to the Primary number.</p>
                  
                  {emergencyContacts.map((num, index) => (
                    <div key={index} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                      <input 
                        type="text" 
                        value={num} 
                        onChange={(e) => {
                          const newNums = [...emergencyContacts];
                          newNums[index] = e.target.value;
                          setEmergencyContacts(newNums);
                        }}
                        placeholder={index === 0 ? "Primary Emergency Number (+880...)" : `Optional Number ${index}`}
                        style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 6, flex: 1 }}
                      />
                      {index > 0 && (
                        <button 
                          onClick={() => setEmergencyContacts(emergencyContacts.filter((_, i) => i !== index))}
                          style={{ padding: "8px 12px", background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 6, cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => setEmergencyContacts([...emergencyContacts, ""])}
                    style={{ marginTop: 8, padding: "8px 16px", background: "#e2e8f0", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
                  >
                    + Add Optional Number
                  </button>
                </div>

                <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                  <button 
                    onClick={saveFleetSetup}
                    style={{ padding: "12px 32px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 16 }}
                  >
                    Save Bus Setup
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* LIVE MAP TAB */}
      {/* ========================================== */}
      {activeTab === "map" && (
        <div style={{ padding: "32px 32px 0 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Live Fleet Map</h3>
            <select 
              value={mapBusId} 
              onChange={(e) => setMapBusId(e.target.value)}
              style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: "bold" }}
            >
              {allBuses.map(b => <option key={b.busId} value={b.busId}>{b.busName} ({b.busId})</option>)}
            </select>
          </div>
          <LiveMap userRole="admin" targetBusId={mapBusId} />
        </div>
      )}

      {/* ========================================== */}
      {/* CAMERA TAB */}
      {/* ========================================== */}
      {activeTab === "camera" && (
        <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Capture Photo</h2>
          <p>Request a live image from the bus camera.</p>
          
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 24 }}>
            <select 
              value={cameraBusId} 
              onChange={(e) => setCameraBusId(e.target.value)}
              style={{ padding: "12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: "bold" }}
            >
              {allBuses.map(b => <option key={b.busId} value={b.busId}>{b.busName} ({b.busId})</option>)}
            </select>

            <button 
              onClick={async () => {
                if (!cameraBusId) return toast.error("Select a bus first!");
                const loading = toast.loading("Triggering camera...");
                await fetch("http://localhost:5000/api/trips/photo/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busId: cameraBusId }) });
                toast.success("Capture command sent!", { id: loading });
              }}
              style={{ padding: "12px 24px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}
            >
              <Camera size={18} /> Trigger Camera
            </button>
          </div>

          <div style={{ marginTop: 32 }}>
            <CameraViewer />
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* AUDIO TAB */}
      {/* ========================================== */}
      {activeTab === "audio" && (
        <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Voice Messages</h2>
          <p>Record a message to broadcast to the bus. The bus will beep 3 times.</p>
          
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 24 }}>
            <select 
              value={audioBusId} 
              onChange={(e) => setAudioBusId(e.target.value)}
              style={{ padding: "12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: "bold" }}
            >
              {allBuses.map(b => <option key={b.busId} value={b.busId}>{b.busName} ({b.busId})</option>)}
            </select>

            {!isRecording ? (
              <button onClick={startRecording} style={{ padding: "12px 24px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
                <Mic size={18} /> Start Recording
              </button>
            ) : (
              <button onClick={stopRecording} style={{ padding: "12px 24px", background: "#10b981", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
                <Square size={18} /> Stop & Send
              </button>
            )}
          </div>
        </div>
      )}

    </Layout>
  );
}

function CameraViewer() {
  const [photo, setPhoto] = useState<any>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 48 }}>
      <div style={{ width: 40, height: 40, border: "4px solid #e2e8f0", borderTop: "4px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      <p style={{ marginTop: 16, color: "#64748b" }}>Loading camera...</p>
    </div>
  );

  if (!photo) return (
    <div style={{ background: "#f8fafc", padding: 48, borderRadius: 12, border: "2px dashed #cbd5e1", textAlign: "center", color: "#64748b" }}>
      <p>No photos captured yet. Click "Trigger Camera" to request a photo.</p>
    </div>
  );

  return (
    <div style={{ background: "#f8fafc", padding: 24, borderRadius: 12, border: "1px solid #e2e8f0" }}>
      <p style={{ margin: "0 0 8px 0" }}><strong>Status:</strong> {photo.status}</p>
      <p style={{ margin: "0 0 16px 0" }}><strong>Time:</strong> {new Date(photo.uploadedAt).toLocaleTimeString()}</p>
      {imageUrl ? (
        <img src={imageUrl} alt="Bus Capture" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #ccc", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
      ) : (
        <p>Loading image...</p>
      )}
    </div>
  );
}