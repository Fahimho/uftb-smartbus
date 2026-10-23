# UFTB SmartBus

Intelligent University Transportation Monitoring and Emergency Response System.

## Structure

- `firmware/` — ESP32-S3 firmware (PlatformIO / Arduino)
- `backend/` — Node.js + TypeScript backend + MQTT bridge
- `web/` — React + TypeScript + Vite admin/student/guest UI
- `docs/` — Phase 1 planning documents
- `tests/` — cross-cutting test fixtures and evidence

## Quick start (development)

See `docs/SETUP_WINDOWS.md` (created in Phase 10). For now:

```powershell
cd backend && npm install && npm run dev
cd web     && npm install && npm run dev