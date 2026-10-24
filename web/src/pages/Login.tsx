import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/"); // AuthContext will handle redirect based on role
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
      <div style={{ padding: 40, background: "white", borderRadius: 12, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", width: "100%", maxWidth: 400 }}>
        <h1 style={{ marginTop: 0, marginBottom: 24, textAlign: "center" }}>UFTB SmartBus Login</h1>
        {error && <p style={{ color: "red", background: "#fee2e2", padding: 10, borderRadius: 6, fontSize: 14 }}>{error}</p>}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ padding: 12, borderRadius: 6, border: "1px solid #ccc" }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ padding: 12, borderRadius: 6, border: "1px solid #ccc" }} />
          <button type="submit" style={{ padding: 12, background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer" }}>Sign In</button>
        </form>
      </div>
    </div>
  );
}