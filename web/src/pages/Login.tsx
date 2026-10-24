import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext"; // Import Auth Context

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const navigate = useNavigate();
  const { user, loading } = useAuth(); // Get the user state from context

  // This useEffect watches for successful login and redirects properly
  useEffect(() => {
    if (user && !loading) {
      navigate("/"); // RoleRedirect in App.tsx will handle the rest
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoggingIn(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // We don't navigate here! The useEffect above will handle it 
      // once the AuthContext finishes fetching the profile.
    } catch (err: any) {
      setError(err.message);
      setIsLoggingIn(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
      <div style={{ padding: 40, background: "white", borderRadius: 12, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", width: "100%", maxWidth: 400 }}>
        <h1 style={{ marginTop: 0, marginBottom: 24, textAlign: "center" }}>UFTB SmartBus Login</h1>
        {error && <p style={{ color: "red", background: "#fee2e2", padding: 10, borderRadius: 6, fontSize: 14 }}>{error}</p>}
        
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input 
            type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required 
            style={{ padding: 12, borderRadius: 6, border: "1px solid #ccc" }} 
          />
          <input 
            type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required 
            style={{ padding: 12, borderRadius: 6, border: "1px solid #ccc" }} 
          />
          <button 
            type="submit" 
            disabled={isLoggingIn}
            style={{ padding: 12, background: isLoggingIn ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: 6, fontWeight: "bold", cursor: isLoggingIn ? "not-allowed" : "pointer" }}
          >
            {isLoggingIn ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}