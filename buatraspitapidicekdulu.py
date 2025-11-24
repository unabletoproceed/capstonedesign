# filename: buatraspitapidicekdulu.py
import uRAD_USB_SDK11
import serial
import numpy as np
from numpy.fft import fft, fftfreq
from time import sleep, time
from scipy.signal import butter, lfilter
import math
import json
from datetime import datetime
from supabase import create_client, Client
import sys

# ================== KONFIGURASI SUPABASE ==================
URL = "https://ohbpqbhphpdlqzdnvtov.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODM0MTIsImV4cCI6MjA3OTI1OTQxMn0.wh_4j201Ci6C3cR-gCnwwe6mt3hyS_BAqs_7mExezqY"
supabase: Client = create_client(URL, KEY)

# ================== KONFIGURASI RADAR ==================
SUDUT_DEPRESI_RADAR = 35 
COM_PORT = '/dev/ttyACM0'  # Port khusus Raspberry Pi
mode = 2
f0, BW, Rmax = 5, 240, 100
Ns = 200
I_true, Q_true = True, True
HISTORY_LENGTH = 128

# Konstanta Fisika
SUDUT_RAD = math.radians(SUDUT_DEPRESI_RADAR)
c, fc = 3e8, (24.005 + f0 / 1000) * 1e9
Lambda = c / fc
RANGE_BIN_CALIBRATED = 0.650

# ================== FUNGSI PROSES ==================
def closeProgram(ser_port):
    if ser_port and ser_port.is_open: uRAD_USB_SDK11.turnOFF(ser_port); ser_port.close()

def get_fft1_and_complex_target(I, Q, Ns):
    max_voltage = 3.3; ADC_intervals = 4096 
    mean_I = np.mean(I); mean_Q = np.mean(Q)
    data_i = (I - mean_I) * (max_voltage / ADC_intervals)
    data_q = (Q - mean_Q) * (max_voltage / ADC_intervals)
    
    ComplexSignal = data_i + 1j * data_q
    ComplexVectorFFT = fft(ComplexSignal * np.hanning(Ns))
    Magnitude = np.abs(ComplexVectorFFT)
    
    # Cari peak (Target)
    search_area = Magnitude[2:int(Ns/2)]
    if len(search_area) > 0:
        index_fft1 = np.argmax(search_area) + 2
    else:
        index_fft1 = 0
        
    target_complex_signal = ComplexVectorFFT[index_fft1]
    return Magnitude, index_fft1, target_complex_signal

# ================== MAIN PROGRAM ==================
try:
    print(f"Connecting to Radar on {COM_PORT}...")
    ser = serial.Serial(COM_PORT, baudrate=int(1e6), timeout=3)
    uRAD_USB_SDK11.turnON(ser)
    uRAD_USB_SDK11.loadConfiguration(ser, mode, f0, BW, Ns, 1, Rmax, 0, 0, 10, 0, 0, 1, I_true, Q_true, 0)
    print("Radar Started. Sending data to Supabase...")
    sleep(1)

    complex_history = []
    phase_history_ranging = []
    t_start = time()
    chirp_rate_aktual = 180.0 

    while True:
        code, res, raw = uRAD_USB_SDK11.detection(ser)
        
        if code == 0 and len(raw) == 2:
            I, Q = raw[0], raw[1]
            
            # FFT 1 (Range)
            mag1, idx1, c_val = get_fft1_and_complex_target(I, Q, Ns)
            
            complex_history.append(c_val)
            phase_history_ranging.append(np.angle(c_val))
            
            if len(complex_history) > HISTORY_LENGTH:
                complex_history.pop(0)
                phase_history_ranging.pop(0)

            # Hitung Jarak
            jarak_final = 0
            if len(phase_history_ranging) > 15:
                ph_un = np.unwrap(phase_history_ranging)
                ph_dc = ph_un - np.mean(ph_un)
                x_mm = 1000 * ph_dc * Lambda / (2 * np.pi)
                b, a = butter(4, 0.01)
                x_fil = lfilter(b, a, x_mm)
                j_kasar = idx1 * (RANGE_BIN_CALIBRATED * 1000)
                jarak_final = ((j_kasar + (x_fil[-15]/2.0)) / 1000.0) * math.sin(SUDUT_RAD)

            # Hitung Kecepatan
            kecep_final = 0
            fft2_mag_plot = [] 
            
            if len(complex_history) == HISTORY_LENGTH:
                t_stop = time()
                dt = t_stop - t_start
                if dt > 0: chirp_rate_aktual = HISTORY_LENGTH / dt
                t_start = t_stop 

                arr_complex = np.array(complex_history)
                fft2 = fft(arr_complex * np.hanning(HISTORY_LENGTH))
                fft2_mag = np.abs(fft2[:HISTORY_LENGTH//2])
                freqs = fftfreq(HISTORY_LENGTH, d=1/chirp_rate_aktual)[:HISTORY_LENGTH//2]

                valid_idx = np.where(freqs > 0)[0]
                if len(valid_idx) > 0:
                    peak_sub = np.argmax(fft2_mag[valid_idx[0]:]) + valid_idx[0]
                    freq_doppler = freqs[peak_sub]
                    kecep_final = (freq_doppler * Lambda / 2) / math.cos(SUDUT_RAD)
                
                fft2_mag_plot = fft2_mag.tolist()

            # Payload
            technical_data = {
                "raw_i": I,
                "raw_q": Q,
                "range_fft": mag1[0:int(Ns/2)].tolist(),
                "mag_history": np.abs(complex_history).tolist(),
                "phase_history": np.angle(complex_history).tolist(),
                "doppler_spec": fft2_mag_plot if len(fft2_mag_plot) > 0 else []
            }

            payload = {
                "timestamp": datetime.utcnow().isoformat(),
                "velocity": round(float(kecep_final), 3),
                "discharge": round(float(jarak_final), 3),
                "raw_json": technical_data
            }

            try:
                supabase.table("radar_data").insert(payload).execute()
                print(f"Sent: D={jarak_final:.3f} | V={kecep_final:.3f}")
            except Exception as e:
                print(f"Upload Error: {e}")

except KeyboardInterrupt:
    print("\nStopping...")
except Exception as e:
    print(f"System Error: {e}")
finally:
    if 'ser' in locals(): closeProgram(ser)