import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";

export default function App() {
  const [email, setEmail] = useState("student@uftb.edu");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false); // <-- New State
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setProfile(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();

      const response = await fetch("http://localhost:5000/api/auth/me", {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Failed to fetch profile from backend");

      const data = await response.json();
      setProfile(data.profile);

    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  return (
    <div style={{ fontFamily: "system-ui", padding: 32, maxWidth: 600, margin: "0 auto" }}>
      <h1>UFTB SmartBus</h1>
      
      {!profile ? (
        <div style={{ padding: 20, border: "1px solid #ccc", borderRadius: 8 }}>
          <h2>Login</h2>
          {error && <p style={{ color: "red" }}>{error}</p>}
          
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="Email"
              style={{ padding: 8 }}
            />
            
            {/* Password field with Eye Icon */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Password"
                style={{ padding: 8, width: "100%", boxSizing: "border-box", paddingRight: 40 }}
              />
              
              {/* SVG Icon Toggle */}
              <div 
                onClick={() => setShowPassword(!showPassword)}
                style={{ 
                  position: "absolute", 
                  right: 10, 
                  cursor: "pointer", 
                  display: "flex", 
                  alignItems: "center",
                  color: "#666"
                }}
              >
                {showPassword ? (
                  // Eye Off Icon (Hidden)
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  // Eye Icon (Visible)
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </div>
            </div>

            <button type="submit" style={{ padding: 10, background: "blue", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
              Sign In
            </button>
          </form>
        </div>
      ) : (
        <div style={{ padding: 20, border: "1px solid green", borderRadius: 8, background: "#f0fff0" }}>
          <h2>Welcome, {profile.displayName}!</h2>
          <p><strong>Role:</strong> {profile.role}</p>
          <p><strong>Email:</strong> {profile.email}</p>
          <p><strong>UID:</strong> {profile.uid}</p>
          
          <button 
            onClick={handleLogout}
            style={{ padding: 10, background: "red", color: "white", border: "none", borderRadius: 4, marginTop: 10, cursor: "pointer" }}
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}