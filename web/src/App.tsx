export default function App() {
  return (
    <div style={{ fontFamily: "system-ui", padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <h1>UFTB SmartBus</h1>
      <p>
        <strong>Phase 2 — Foundation</strong>
      </p>
      <ul>
        <li>Web frontend: ✅ working</li>
        <li>Backend skeleton: ✅ (run separately)</li>
        <li>Firmware skeleton: ✅ (compiles when PlatformIO installed)</li>
      </ul>
      <p style={{ color: "#555", fontSize: 14 }}>
        Photos only — no video in this release.
        Real features arrive starting Phase 3.
      </p>
    </div>
  );
}