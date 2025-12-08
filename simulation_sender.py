import time
import random
import numpy as np
from datetime import datetime, timezone
from supabase import create_client, Client

# --- CONFIGURATION ---
url = "https://ohbpqbhphpdlqzdnvtov.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODM0MTIsImV4cCI6MjA3OTI1OTQxMn0.wh_4j201Ci6C3cR-gCnwwe6mt3hyS_BAqs_7mExezqY"
supabase: Client = create_client(url, key)

print("--- RADAR SIMULATION: Sending to 'sim_data' ---")

# Radar Constants
Ns = 200
HISTORY_LENGTH = 128

while True:
    # 1. Generate Fake Physics (Rain/Flood Logic)
    # Simulate a wave of velocity (0.5 to 3.0 m/s)
    velocity = 1.75 + 1.25 * np.sin(time.time() * 0.2) + random.uniform(-0.1, 0.1)
    discharge = velocity * 12.5 # Fake Area
    
    # ==========================================
    # 2. GENERATE FAKE SIGNAL ARRAYS (For the Charts)
    # ==========================================
    
    # A. Raw Signal (Fast Time) - Sine waves shifting phase
    t = np.linspace(0, 20, Ns)
    phase_shift = time.time() * 5
    raw_i = (2048 + 1000 * np.sin(t + phase_shift) + np.random.normal(0, 50, Ns)).tolist()
    raw_q = (2048 + 1000 * np.cos(t + phase_shift) + np.random.normal(0, 50, Ns)).tolist()
    
    # B. Range FFT (Green Line) - Spike moves slightly
    range_fft = np.zeros(100)
    target_bin = int(10 + 2 * np.sin(time.time()))
    range_fft[target_bin] = 15.0 + random.uniform(-1, 1) # Main Peak
    range_fft += np.random.normal(0, 0.5, 100) # Noise floor
    
    # C. Doppler Spectrum (Black Line) - Spike moves with Velocity
    doppler_spec = np.zeros(128)
    vel_bin = int(velocity * 20) + 10
    if vel_bin < 128:
        doppler_spec[vel_bin] = 5.0 + random.uniform(-0.5, 0.5)
    doppler_spec += np.random.normal(0, 0.2, 128)

    # D. History Buffers
    mag_history = (np.random.normal(10, 0.2, HISTORY_LENGTH)).tolist()
    phase_history = (np.random.normal(0.1, 0.01, HISTORY_LENGTH)).tolist()

    # Bundle into JSON
    technical_data = {
        "raw_i": raw_i,
        "raw_q": raw_q,
        "range_fft": range_fft.tolist(),
        "mag_history": mag_history,
        "phase_history": phase_history,
        "doppler_spec": doppler_spec.tolist()
    }

    # ==========================================
    # 3. SEND TO SUPABASE ('sim_data')
    # ==========================================
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "velocity": round(velocity, 3),
        "discharge": round(discharge, 3),
        "raw_json": technical_data
    }

    try:
        # TARGETING NEW TABLE HERE
        supabase.table("sim_data").insert(payload).execute()
        print(f"Sent Sim Data: Vel={velocity:.3f} m/s")
    except Exception as e:
        print(f"Error: {e}")

    time.sleep(1) # Send every 1 second