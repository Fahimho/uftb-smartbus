import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import LiveMap from "../components/LiveMap";
import { AlertTriangle, Map as MapIcon, X, Camera, Mic, Square, Bus, Trash2, Wifi, UserPlus, Users, Eye, EyeOff } from "lucide-react";
import { ChevronLeft, ChevronRight, Download, RotateCcw } from "lucide-react";
import { getFirestore, collection, onSnapshot, query, where, doc, deleteDoc } from "firebase/firestore";
import { connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { connectStorageEmulator } from "firebase/storage";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { auth } from "../firebase";

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
  const { user } = useAuth();
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
  const [busIp, setBusIp] = useState("");
  const [route, setRoute] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [helperName, setHelperName] = useState("");
  const [helperPhone, setHelperPhone] = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState<string[]>([]);

  // Staff Management State
  const [staffList, setStaffList] = useState<any[]>([]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffBusId, setNewStaffBusId] = useState("");
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  // Voice Request State (NEW)
  const [voiceRequests, setVoiceRequests] = useState<any[]>([]);
  const [listeningForBus, setListeningForBus] = useState(false);
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  const listenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 4. Listen to all Operators (Staff)
  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "operator"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setStaffList(list);
    });
    return () => unsub();
  }, []);

  // 5. Listen to Voice Requests (NEW)
  useEffect(() => {
    if (!audioBusId) return;
    const q = query(
      collection(db, "voiceRequests"),
      where("busId", "==", audioBusId),
      where("status", "==", "STORED")
    );
    const unsub = onSnapshot(q, async (snapshot) => {
      const sorted = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      setVoiceRequests(sorted);
      for (const v of sorted) {
        try {
          const url = await getDownloadURL(ref(storage, v.storagePath));
          setVoiceUrls(prev => ({ ...prev, [v.id]: url }));
        } catch (e) { console.warn(`Could not load voice ${v.id}`, e); }
      }
    });
    return () => unsub();
  }, [audioBusId]);

  // 6. NEW: Clear timeout when a new recording arrives
  useEffect(() => {
    if (voiceRequests.length > 0 && listeningForBus) {
      if (listenTimerRef.current) {
        clearTimeout(listenTimerRef.current);
        listenTimerRef.current = null;
      }
      setListeningForBus(false);
      toast.dismiss("listen");
      toast.success("Recording received!", { id: "listen-ok" });
    }
  }, [voiceRequests, listeningForBus]);

  // 7. Fetch ALL Buses on mount
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

  // 8. Load Fleet Setup when selectedBusId changes
  useEffect(() => {
    if (!selectedBusId) return;
    
    fetch(`http://localhost:5000/api/trips/setup/${selectedBusId}`)
      .then(res => res.json())
      .then(data => {
        if (data.busId) {
          setBusName(data.busName || "");
          setBusIp(data.lastIp || "Waiting for connection...");
          setRoute(data.route || "");
          setDriverName(data.driverName || "");
          setDriverPhone(data.driverPhone || "");
          setHelperName(data.helperName || "");
          setHelperPhone(data.helperPhone || "");
          setEmergencyContacts(data.emergencyContacts || [""]);
        } else {
          setBusName("");
          setBusIp("Waiting for connection...");
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

  // Create Operator (Staff)
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail || !newStaffPassword || !newStaffBusId) {
      return toast.error("Please fill all fields");
    }

    const loading = toast.loading("Creating staff account...");
    
    try {
      const token = await auth.currentUser?.getIdToken();
      
      if (!token) {
        toast.error("Session expired. Please log in again.", { id: loading });
        return;
      }

      const res = await fetch("http://localhost:5000/api/auth/register-staff", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({
          email: newStaffEmail,
          password: newStaffPassword,
          displayName: newStaffName,
          role: "operator",
          assignedBusId: newStaffBusId
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("Operator created successfully!", { id: loading });
        setNewStaffName("");
        setNewStaffEmail("");
        setNewStaffPassword("");
        setNewStaffBusId("");
      } else {
        toast.error(data.error || "Backend rejected the request", { id: loading });
      }
    } catch (err: any) {
      console.error("Fetch Error:", err);
      toast.error(`Error: ${err.message}`, { id: loading });
    }
  };

  // Delete Operator (Staff)
  const handleDeleteStaff = async (staffId: string, staffName: string) => {
    if (!window.confirm(`Are you sure you want to delete ${staffName}?`)) return;
    try {
      await deleteDoc(doc(db, "users", staffId));
      toast.success(`Deleted ${staffName}`);
    } catch (err) {
      toast.error("Failed to delete staff");
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

  // Handle View Trip Attendance
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

  // NEW: Handle Listen to Bus
  const handleListenToBus = async () => {
    if (!audioBusId) return toast.error("Select a bus first!");
    setListeningForBus(true);
    toast.loading("Recording request sent. Waiting for bus...", { id: "listen" });

    try {
      const res = await fetch("http://localhost:5000/api/trips/voice/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busId: audioBusId })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Recording request sent to ${getBusName(audioBusId)}. Waiting...`, { id: "listen", duration: 3000 });
        listenTimerRef.current = setTimeout(() => {
          if (listeningForBus) {
            toast.error("Bus did not respond in 30 seconds. Check if the bus is online.", { id: "listen" });
            setListeningForBus(false);
          }
        }, 30000);
      } else {
        toast.error(data.error || "Failed to send request", { id: "listen" });
        setListeningForBus(false);
      }
    } catch (err) {
      toast.error("Network error", { id: "listen" });
      setListeningForBus(false);
    }
  };

  // Audio recording functions (Admin → Bus broadcast)
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
    if (!busId) return "Not Assigned";
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

          <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
            {!selectedBusId ? (
              <div style={{ textAlign: "center", color: "#64748b", padding: 48 }}>
                <Bus size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <h2>Select a bus from the left to configure</h2>
              </div>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>Setup: {selectedBusId}</h2>
                
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
      {/* STAFF MANAGEMENT TAB */}
      {/* ========================================== */}
      {activeTab === "staff" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <UserPlus size={24} color="#3b82f6" />
              <h2 style={{ margin: 0 }}>Create New Operator</h2>
            </div>
            
            <form onSubmit={handleCreateStaff} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <input placeholder="Full Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} required />
              <input type="email" placeholder="Email Address" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} required />
              
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input 
                  type={showStaffPassword ? "text" : "password"} 
                  placeholder="Password (min 6 chars)" 
                  value={newStaffPassword} 
                  onChange={e => setNewStaffPassword(e.target.value)} 
                  style={{ width: "100%", padding: 10, paddingRight: 40, borderRadius: 6, border: "1px solid #cbd5e1" }} 
                  required 
                />
                <div 
                  onClick={() => setShowStaffPassword(!showStaffPassword)}
                  style={{ position: "absolute", right: 12, cursor: "pointer", color: "#94a3b8" }}
                >
                  {showStaffPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </div>
              </div>

              <select value={newStaffBusId} onChange={e => setNewStaffBusId(e.target.value)} style={{ padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }} required>
                <option value="">-- Assign to Bus --</option>
                {allBuses.map(b => (
                  <option key={b.busId} value={b.busId}>{b.busName || "Unnamed"} ({b.busId})</option>
                ))}
              </select>
              
              <button type="submit" style={{ gridColumn: "span 2", padding: "12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 16, cursor: "pointer" }}>
                Create Operator Account
              </button>
            </form>
          </div>

          <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <Users size={24} color="#3b82f6" />
              <h2 style={{ margin: 0 }}>Active Operators</h2>
            </div>

            {staffList.length === 0 ? (
              <p style={{ color: "#64748b" }}>No operators created yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", fontSize: 14, color: "#64748b" }}>
                    <th style={{ padding: "16px", fontWeight: 600 }}>Name</th>
                    <th style={{ padding: "16px", fontWeight: 600 }}>Email</th>
                    <th style={{ padding: "16px", fontWeight: 600 }}>Assigned Bus</th>
                    <th style={{ padding: "16px", fontWeight: 600 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map(staff => (
                    <tr key={staff.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "16px", fontWeight: "bold" }}>{staff.displayName || "Unknown"}</td>
                      <td style={{ padding: "16px", color: "#64748b" }}>{staff.email}</td>
                      <td style={{ padding: "16px" }}>
                        <span style={{ background: "#dbeafe", color: "#1e40af", padding: "4px 8px", borderRadius: 12, fontSize: 12, fontWeight: "bold" }}>
                          {getBusName(staff.assignedBusId)}
                        </span>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <button 
                          onClick={() => handleDeleteStaff(staff.id, staff.displayName)}
                          style={{ padding: "6px 12px", background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <PhotoGallery selectedBusId={cameraBusId} busName={getBusName(cameraBusId)} />
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* AUDIO TAB (Voice Messages) */}
      {/* ========================================== */}
      {activeTab === "audio" && (
        <div style={{ background: "white", padding: 32, borderRadius: 12 }}>
          <h2 style={{ marginTop: 0 }}>Voice Messages</h2>
          <p>Record a message to broadcast to the bus, or request a live recording from the bus.</p>
          
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 24, flexWrap: "wrap" }}>
            <select 
              value={audioBusId} 
              onChange={(e) => setAudioBusId(e.target.value)}
              style={{ padding: "12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: "bold" }}
            >
              {allBuses.map(b => <option key={b.busId} value={b.busId}>{b.busName} ({b.busId})</option>)}
            </select>

            {!isRecording ? (
              <button onClick={startRecording} style={{ padding: "12px 24px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
                <Mic size={18} /> Start Recording (Broadcast)
              </button>
            ) : (
              <button onClick={stopRecording} style={{ padding: "12px 24px", background: "#10b981", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
                <Square size={18} /> Stop & Send
              </button>
            )}

            <button 
              onClick={handleListenToBus}
              disabled={listeningForBus}
              style={{ padding: "12px 24px", background: listeningForBus ? "#cbd5e1" : "#8b5cf6", color: "white", border: "none", borderRadius: 8, cursor: listeningForBus ? "not-allowed" : "pointer", fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}
            >
              🎧 {listeningForBus ? "Listening..." : "Listen to Bus"}
            </button>
          </div>

          <div style={{ marginTop: 32 }}>
            <h3>🎧 Voice Inbox — {getBusName(audioBusId)}</h3>
            {voiceRequests.length === 0 ? (
              <p style={{ color: "#64748b" }}>No recordings yet. Click "Listen to Bus" to request one.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {voiceRequests.map((v) => (
                  <div key={v.id} style={{ padding: 16, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <strong>Recording from {getBusName(v.busId)}</strong>
                      <span style={{ color: "#64748b", fontSize: 14 }}>{new Date(v.uploadedAt).toLocaleString()} · {v.durationSeconds}s</span>
                    </div>
                    {voiceUrls[v.id] && (
                      <audio controls src={voiceUrls[v.id]} style={{ width: "100%" }} />
                    )}
                    {voiceUrls[v.id] && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button 
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = voiceUrls[v.id];
                            a.download = `${getBusName(v.busId)}_${v.id}.mp3`;
                            a.click();
                          }}
                          style={{ padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}
                        >
                          ⬇ Download
                        </button>
                        <button 
                          onClick={async () => {
                            if (!window.confirm("Delete this recording from database and storage?")) return;
                            const loadingToast = toast.loading("Deleting recording...");
                            try {
                              const res = await fetch(`http://localhost:5000/api/trips/voice/${v.id}`, { method: "DELETE" });
                              if (res.ok) {
                                toast.success("Recording deleted", { id: loadingToast });
                                setVoiceUrls(prev => {
                                  const copy = { ...prev };
                                  delete copy[v.id];
                                  return copy;
                                });
                              } else {
                                toast.error("Failed to delete recording", { id: loadingToast });
                              }
                            } catch (err) {
                              toast.error("Network error", { id: loadingToast });
                            }
                          }}
                          style={{ padding: "6px 12px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </Layout>
  );
}

function PhotoGallery({ selectedBusId, busName }: { selectedBusId: string, busName: string }) {
  const [photos, setPhotos] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBusId) {
      setPhotos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setPhotos([]);
    setCurrentIndex(0);
    setImageUrls({});

    const q = query(
      collection(db, "capturePhotoRequests"),
      where("status", "==", "STORED"),
      where("busId", "==", selectedBusId)
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const sorted = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      setPhotos(sorted);

      for (const photo of sorted) {
        try {
          const url = await getDownloadURL(ref(storage, `photos/${photo.id}.jpg`));
          setImageUrls(prev => ({ ...prev, [photo.id]: url }));
        } catch (e) {
          console.warn(`Could not load photo ${photo.id}`, e);
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [selectedBusId]);

  const goNext = () => setCurrentIndex(i => Math.min(i + 1, photos.length - 1));
  const goPrev = () => setCurrentIndex(i => Math.max(i - 1, 0));

  const handleDelete = async (photoId: string) => {
    if (!window.confirm("Delete this photo from database and storage?")) return;
    const loadingToast = toast.loading("Deleting photo...");
    try {
      const res = await fetch(`http://localhost:5000/api/trips/photo/${photoId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Photo deleted", { id: loadingToast });
        setImageUrls(prev => {
          const copy = { ...prev };
          delete copy[photoId];
          return copy;
        });
        if (currentIndex >= photos.length - 1 && currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
        }
      } else {
        toast.error("Failed to delete photo", { id: loadingToast });
      }
    } catch (err) {
      toast.error("Network error", { id: loadingToast });
    }
  };

  const handleDownload = (photoId: string) => {
    const url = imageUrls[photoId];
    if (!url) return toast.error("Photo not loaded yet");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${busName}_${photoId}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = async () => {
    if (photos.length === 0) return toast.error("No photos to download");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const folderName = `${busName}_${selectedBusId}_${timestamp}`;
    toast.loading(`Downloading ${photos.length} photos...`, { id: "dlall" });
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const url = imageUrls[photo.id];
      if (!url) continue;
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName}_photo_${i + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      await new Promise(r => setTimeout(r, 300));
    }
    toast.success(`${photos.length} photos downloaded`, { id: "dlall" });
  };

  const handleDeleteAll = async () => {
    if (photos.length === 0) return toast.error("No photos to delete");
    if (!window.confirm(`Delete ALL ${photos.length} photos for ${busName}? This cannot be undone.`)) return;

    const loadingToast = toast.loading(`Deleting ${photos.length} photos...`);
    let failed = 0;

    for (const photo of photos) {
      try {
        const res = await fetch(`http://localhost:5000/api/trips/photo/${photo.id}`, { method: "DELETE" });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      toast.success(`All ${photos.length} photos deleted`, { id: loadingToast });
    } else {
      toast.error(`${failed} photos failed to delete`, { id: loadingToast });
    }

    setPhotos([]);
    setCurrentIndex(0);
    setImageUrls({});
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setImageUrls({});
    toast.success("Gallery reset");
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
        <div style={{ width: 40, height: 40, border: "4px solid #e2e8f0", borderTop: "4px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <p style={{ marginTop: 16 }}>Loading photos...</p>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div style={{ background: "#f8fafc", padding: 48, borderRadius: 12, border: "2px dashed #cbd5e1", textAlign: "center", color: "#64748b" }}>
        <p>No photos captured yet for {busName}. Click "Trigger Camera" to request one.</p>
      </div>
    );
  }

  const current = photos[currentIndex];
  const currentUrl = imageUrls[current?.id];

  return (
    <div>
      <div style={{ position: "relative", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, background: "#f8fafc" }}>
        {currentUrl ? (
          <img src={currentUrl} alt="Captured" style={{ maxWidth: "100%", maxHeight: 500, borderRadius: 8, display: "block", margin: "0 auto" }} />
        ) : (
          <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>Loading image...</div>
        )}

        <div style={{ position: "absolute", top: 24, right: 24, background: "rgba(0,0,0,0.6)", color: "white", padding: "4px 12px", borderRadius: 8, fontSize: 14, fontWeight: "bold" }}>
          {currentIndex + 1} / {photos.length}
        </div>

        {currentIndex > 0 && (
          <button onClick={goPrev} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", color: "white", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={28} />
          </button>
        )}

        {currentIndex < photos.length - 1 && (
          <button onClick={goNext} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", color: "white", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronRight size={28} />
          </button>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <div style={{ fontSize: 14, color: "#64748b" }}>
            <strong>Captured:</strong> {new Date(current.uploadedAt).toLocaleString()}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleDownload(current.id)} style={{ padding: "8px 16px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: "bold" }}>
              <Download size={16} /> Download
            </button>
            <button onClick={() => handleDelete(current.id)} style={{ padding: "8px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: "bold" }}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, overflowX: "auto", paddingBottom: 8 }}>
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            onClick={() => setCurrentIndex(i)}
            style={{ width: 100, height: 70, flexShrink: 0, borderRadius: 6, cursor: "pointer", border: i === currentIndex ? "3px solid #3b82f6" : "2px solid #e2e8f0", overflow: "hidden", background: "#f8fafc" }}
          >
            {imageUrls[photo.id] ? (
              <img src={imageUrls[photo.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 10 }}>...</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button onClick={handleReset} style={{ padding: "10px 20px", background: "#e2e8f0", color: "#334155", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: "bold" }}>
          <RotateCcw size={16} /> Reset
        </button>
        <button onClick={handleDownloadAll} style={{ padding: "10px 20px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: "bold" }}>
          <Download size={16} /> Download All ({photos.length})
        </button>
        <button onClick={handleDeleteAll} style={{ padding: "10px 20px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: "bold" }}>
          <Trash2 size={16} /> Delete All ({photos.length})
        </button>
      </div>
    </div>
  );
}