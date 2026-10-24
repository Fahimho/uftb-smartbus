import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // <-- Eye icon state
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user && !loading) {
      navigate("/"); 
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoggingIn(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
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
          
          {/* Password field with Eye Icon */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input 
              type={showPassword ? "text" : "password"} 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Password"
              required
              style={{ padding: 12, width: "100%", boxSizing: "border-box", paddingRight: 40, borderRadius: 6, border: "1px solid #ccc" }}
            />
            <div 
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 12, cursor: "pointer", display: "flex", alignItems: "center", color: "#666" }}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </div>
          </div>

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