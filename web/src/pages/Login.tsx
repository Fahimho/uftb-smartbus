import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    setIsLoggingIn(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success("Welcome back!");
    } catch (err: any) {
      // Professional error handling instead of red text box
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error("Invalid email or password.");
      } else {
        toast.error(err.message);
      }
      setIsLoggingIn(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#f3f4f6", fontFamily: "system-ui" }}>
      <div style={{ padding: 40, background: "white", borderRadius: 16, boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", width: "100%", maxWidth: 400, border: "1px solid #e2e8f0" }}>
        
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🚌</div>
          <h1 style={{ margin: 0, fontSize: 24, color: "#0f172a", fontWeight: 800 }}>UFTB SmartBus</h1>
          <p style={{ margin: "8px 0 0 0", color: "#64748b", fontSize: 14 }}>Sign in to your account</p>
        </div>
        
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Email Address</label>
            <input 
              type="email" 
              placeholder="you@uftb.edu" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box", outline: "none", fontSize: 14 }} 
            />
          </div>
          
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Password</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="••••••••"
                required
                style={{ width: "100%", padding: "10px 14px", paddingRight: 40, borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box", outline: "none", fontSize: 14 }}
              />
              <div 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: "absolute", right: 12, cursor: "pointer", display: "flex", alignItems: "center", color: "#94a3b8" }}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoggingIn}
            style={{ padding: "12px", marginTop: 8, background: isLoggingIn ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: isLoggingIn ? "not-allowed" : "pointer", fontSize: 15, transition: "background 0.2s" }}
          >
            {isLoggingIn ? "Signing In..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
          <p style={{ margin: "4px 0" }}>Admin: admin@uftb.edu / password123</p>
          <p style={{ margin: "4px 0" }}>Operator: operator@uftb.edu / password123</p>
          <p style={{ margin: "4px 0" }}>Student: student@uftb.edu / password123</p>
        </div>
      </div>
    </div>
  );
}