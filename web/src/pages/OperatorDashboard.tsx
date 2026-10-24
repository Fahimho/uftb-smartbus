import { useAuth } from "../context/AuthContext";
export default function OperatorDashboard() {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: 40 }}>
      <h1>Operator Dashboard</h1>
      <p>Welcome, {user?.displayName}. Start your trip here.</p>
      <button onClick={logout}>Log Out</button>
    </div>
  );
}