import time
import requests
import math
import sys

# --- CONFIGURATION ---
BACKEND_URL = "http://localhost:5000"
BUS_ID = "BUS-02" 

# Start and End points
START_LAT, START_LNG = 23.8759, 90.3795
END_LAT, END_LNG = 23.8103, 90.4125

STUDENT_UID = "123456789"

def get_curved_path(start, end, steps=30, curve=0.005):
    points = []
    for i in range(steps + 1):
        t = i / steps
        lat = start[0] + (end[0] - start[0]) * t
        lng = start[1] + (end[1] - start[1]) * t
        lat += math.sin(t * math.pi) * curve 
        points.append((lat, lng))
    return points

def send_gps(lat, lng, speed, status):
    payload = {
        "busId": BUS_ID,
        "lat": lat,
        "lng": lng,
        "speed": speed,
        "status": status,
        "ip": "192.168.0.110"
    }
    requests.post(f"{BACKEND_URL}/api/trips/gps", json=payload)
    print(f"[GPS] {status} | Speed: {speed} km/h | Lat: {lat:.4f}, Lng: {lng:.4f}")

def send_attendance():
    payload = {
        "uid": STUDENT_UID,
        "type": "BOARDING",
        "busId": BUS_ID,
        "studentName": "Test Student"
    }
    try:
        res = requests.post(f"{BACKEND_URL}/api/trips/attendance", json=payload)
        if res.status_code == 201:
            print(f"\n🚨 [RFID EVENT] {payload['studentName']} scanned the card and BOARDED!\n")
        else:
            print(f"\n🚨 [RFID ERROR] {res.text}\n")
    except Exception as e:
        print(f"Failed to send attendance: {e}")

def main():
    print(f"🚌 Starting simulation for {BUS_ID}...")
    
    # 1. Start the trip
    res = requests.post(f"{BACKEND_URL}/api/trips/start", json={"busId": BUS_ID, "operatorUid": "simulated_operator"})
    if res.status_code != 201:
        print(f"Error starting trip: {res.text}")
        sys.exit()

    # 2. Generate the path
    path = get_curved_path((START_LAT, START_LNG), (END_LAT, END_LNG))
    
    # 3. Define the exact midpoint as the student's location
    midpoint_index = len(path) // 2
    student_lat, student_lng = path[midpoint_index]
    print(f"📍 Student waiting exactly at: {student_lat:.4f}, {student_lng:.4f}")

    student_served = False
    
    for i, (lat, lng) in enumerate(path):
        # If we reached the midpoint and haven't stopped yet
        if i == midpoint_index and not student_served:
            print("\n🚏 Bus is approaching the student...")
            send_gps(lat, lng, 10, "Stopped")
            time.sleep(2)
            
            print("⏹️ Bus STOPPED. Waiting for student to board...")
            send_gps(lat, lng, 0, "Stopped")
            time.sleep(4) # Wait 4 seconds for boarding
            
            # Trigger the RFID Scan
            send_attendance() 
            
            time.sleep(2)
            print("▶️ Student boarded. Bus resuming route...\n")
            student_served = True
            
        # Send GPS update
        if student_served:
            send_gps(lat, lng, 35, "Moving")
        else:
            send_gps(lat, lng, 40, "Moving")
            
        time.sleep(2) 
    
    print("\n🏁 Trip Complete!")
    # NEW: Wait 2 seconds to ensure all GPS pings have landed in the database
    time.sleep(2) 
    requests.post(f"{BACKEND_URL}/api/trips/end", json={"busId": BUS_ID})

if __name__ == "__main__":
    main()