import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "../firebase";

interface AuthContextType {
  user: any | null; 
  firebaseUser: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUser: (user: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          const res = await fetch("http://localhost:5000/api/auth/me", {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.profile);
          }
        } catch (err) {
          console.error("Failed to fetch profile", err);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};