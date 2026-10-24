import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import OperatorDashboard from "./pages/OperatorDashboard";
import GuestDashboard from "./pages/GuestDashboard";

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>Loading System...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
}

// Smart Redirect Component
function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
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
      <BrowserRouter>
        <Routes>
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

          <Route path="/unauthorized" element={<div style={{ padding: 40, textAlign: "center", fontSize: 24 }}>403 - Unauthorized Access</div>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}