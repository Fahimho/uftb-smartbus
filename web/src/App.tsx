import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import OperatorDashboard from "./pages/OperatorDashboard";
import GuestDashboard from "./pages/GuestDashboard";
import StudentDashboard from "./pages/StudentDashboard";

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", background: "#f3f4f6", fontFamily: "system-ui" }}>
      <div style={{ width: 40, height: 40, border: "4px solid #e2e8f0", borderTop: "4px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      <p style={{ marginTop: 16, color: "#64748b", fontWeight: 500 }}>Loading System...</p>
    </div>
  );
  
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
}

// Smart Redirect Component
function RoleRedirect() {
  const { user, loading } = useAuth();
  
  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <div style={{ width: 40, height: 40, border: "4px solid #e2e8f0", borderTop: "4px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
  
  if (!user) return <Navigate to="/login" replace />;
  
  switch (user.role) {
    case "admin": return <Navigate to="/admin" replace />;
    case "operator": return <Navigate to="/operator" replace />;
    case "guest": return <Navigate to="/guest" replace />;
    case "student": return <Navigate to="/student" replace />;
    default: return <Navigate to="/unauthorized" replace />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      {/* Global Toast Notification Container */}
      <Toaster position="top-right" toastOptions={{ duration: 4000, style: { background: '#333', color: '#fff', fontWeight: 500 } }} />
      
      <BrowserRouter>
        <Routes>
          <Route path="/student" element={
            <ProtectedRoute allowedRoles={["student"]}>
              <StudentDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<RoleRedirect />} />
          
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="/operator" element={
            <ProtectedRoute allowedRoles={["operator", "admin"]}>
              <OperatorDashboard />
            </ProtectedRoute>
          } />

          <Route path="/guest" element={
            <ProtectedRoute allowedRoles={["guest"]}>
              <GuestDashboard />
            </ProtectedRoute>
          } />

          <Route path="/unauthorized" element={
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", background: "#f3f4f6", fontFamily: "system-ui" }}>
              <h1 style={{ fontSize: 48, margin: 0, color: "#ef4444" }}>403</h1>
              <p style={{ fontSize: 20, color: "#64748b", marginTop: 8 }}>Unauthorized Access</p>
              <button onClick={() => window.location.href = '/login'} style={{ marginTop: 24, padding: "10px 20px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
                Return to Login
              </button>
            </div>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}