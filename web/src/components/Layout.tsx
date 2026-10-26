import { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { LayoutDashboard, Bus, Map, AlertTriangle, Camera, Mic, LogOut } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { user, logout } = useAuth();

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} />, roles: ["admin", "operator", "guest", "student"] },
    { id: "trips", label: "Trips & Attendance", icon: <Bus size={20} />, roles: ["admin", "operator"] },
    { id: "map", label: "Live Map", icon: <Map size={20} />, roles: ["admin", "operator", "guest", "student"] }, // <-- Added student
    { id: "emergency", label: "Emergency", icon: <AlertTriangle size={20} />, roles: ["admin"] },
    { id: "camera", label: "Capture Photo", icon: <Camera size={20} />, roles: ["admin"] },
    { id: "audio", label: "Voice Messages", icon: <Mic size={20} />, roles: ["admin"] },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f3f4f6", fontFamily: "system-ui" }}>
      
      {/* SIDEBAR */}
      <div style={{ width: 260, background: "#1e293b", color: "white", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 24, fontSize: 20, fontWeight: "bold", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 10 }}>
          🚌 UFTB SmartBus
        </div>
        <nav style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {menuItems.filter(item => item.roles.includes(user?.role)).map(item => (
            <div 
              key={item.id}
              onClick={() => setActiveTab(item.id)} 
              style={{ 
                display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 8, cursor: "pointer", 
                background: activeTab === item.id ? (item.id === 'emergency' ? '#ef4444' : '#3b82f6') : "transparent",
                transition: "background 0.2s"
              }}
            >
              {item.icon} {item.label}
            </div>
          ))}
        </nav>
        <div style={{ padding: 16, borderTop: "1px solid #334155" }}>
          <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, width: "100%", background: "transparent", color: "#f87171", border: "none", cursor: "pointer", fontSize: 16 }}>
            <LogOut size={20} /> Log Out
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
        
        {/* TOP BAR */}
        <div style={{ background: "white", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: 0, textTransform: "capitalize" }}>{activeTab.replace("-", " ")}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right" }}>
              {/* FIXED: Added optional chaining and fallback */}
              <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.displayName || "User"}</div>
              <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase" }}>{user?.role || "Unknown"}</div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#3b82f6", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
              {/* FIXED: Added optional chaining and fallback */}
              {user?.displayName?.charAt(0) || "U"}
            </div>
          </div>
        </div>

        {/* PAGE CONTENT */}
        <div style={{ padding: 32 }}>
          {children}
        </div>
      </div>
    </div>
  );
}