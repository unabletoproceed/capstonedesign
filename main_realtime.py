#!/usr/bin/python3
import uRAD_USB_SDK11
import serial
import numpy as np
from numpy.fft import fft, fftfreq
from time import sleep, time
import math
import threading
import json
import uuid
from datetime import datetime
from supabase import create_client, Client

# =============================================================================
# 1. KONFIGURASI SISTEM
# =============================================================================
class Config:
    # --- Hardware Raspberry Pi ---
    SERIAL_PORT = '/dev/ttyACM0'  
    
    # --- Supabase Configuration ---
    SUPABASE_URL = "https://ohbpqbhphpdlqzdnvtov.supabase.co"
    SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODM0MTIsImV4cCI6MjA3OTI1OTQxMn0.wh_4j201Ci6C3cR-gCnwwe6mt3hyS_BAqs_7mExezqY" 
    TABLE_NAME = "radar_data"
    
    # --- Session ID (Unique per Boot) ---
    UPLOAD_ID = str(uuid.uuid4())
    
    # --- Timing Strategy ---
    # Upload setiap 1 detik (Real-time Throttling)
    # Jangan diset 0, nanti database crash karena terlalu banyak request
    UPLOAD_INTERVAL = 1.0   

    # --- Parameter Radar (Fixed Mode 2) ---
    MODE = 2
    F0 = 5          
    BW = 240        
    NS = 200        
    NTAR = 1        
    RMAX = 100      
    MTI = 0         
    MTH = 0         
    ALPHA = 0       
    
    # Output SDK
    DISTANCE_TRUE = False
    VELOCITY_TRUE = False
    SNR_TRUE = True     
    I_TRUE = True
    Q_TRUE = True
    MOVEMENT_TRUE = False

    # Geometri
    SUDUT_DEPRESI = 35  
    C_LIGHT = 3e8
    RANGE_RES_CALIBRATED_MM = 560.0  
    RANGE_RES_CALIBRATED_M = RANGE_RES_CALIBRATED_MM / 1000.0 
    
    # Processing
    HISTORY_LENGTH = 256  # Panjang Buffer untuk FFT Doppler
    MIN_DOPPLER_FREQ = 0

# Konstanta Kalkulasi
f_center_hz = (24.005 + Config.F0 / 1000) * 1e9
lambda_wave = Config.C_LIGHT / f_center_hz
sudut_rad = math.radians(Config.SUDUT_DEPRESI)

# =============================================================================
# 2. FUNGSI PENGOLAHAN SINYAL
# =============================================================================
def process_range_fft(I, Q, Ns):
    """FFT Pertama untuk mencari Range/Jarak"""
    max_volts = 3.3
    adc_bits = 4096
    I_volt = (I - np.mean(I)) * (max_volts / adc_bits)
    Q_volt = (Q - np.mean(Q)) * (max_volts / adc_bits)
    
    complex_signal = I_volt + 1j * Q_volt
    fft_result = fft(complex_signal * np.hanning(Ns)) 
    magnitude = np.abs(fft_result)
    
    # Cari puncak (Range Bin), abaikan DC
    search_area = magnitude[2:int(Ns/2)] 
    if len(search_area) == 0:
        return magnitude, 0, 0j
        
    peak_local_index = np.argmax(search_area)
    peak_real_index = peak_local_index + 2
    target_complex_val = fft_result[peak_real_index]
    
    return magnitude, peak_real_index, target_complex_val

def get_interpolated_index(magnitude_spectrum, peak_index):
    """Interpolasi Parabolik agar indeks jarak lebih presisi"""
    if peak_index <= 0 or peak_index >= len(magnitude_spectrum) - 1:
        return float(peak_index)
    
    alpha = magnitude_spectrum[peak_index - 1] 
    beta  = magnitude_spectrum[peak_index]     
    gamma = magnitude_spectrum[peak_index + 1] 
    
    denominator = alpha - 2*beta + gamma
    if denominator == 0: 
        delta = 0 
    else:
        delta = 0.5 * (alpha - gamma) / denominator
        
    exact_index = peak_index + delta
    return exact_index

# =============================================================================
# 3. KELAS UTAMA (REAL-TIME HEADLESS)
# =============================================================================
class RadarRealtimeSystem:
    def __init__(self):
        self.running = True
        
        # Init Supabase
        try:
            self.supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
            print(f"[INFO] Session ID: {Config.UPLOAD_ID}")
        except Exception as e:
            print(f"[ERROR] Gagal init Supabase: {e}")
            self.supabase = None
        
        # Snapshot untuk Raw JSON
        self.last_raw_snapshot = {"I": [], "Q": []}

    def send_data_worker(self, payload):
        """Fungsi ini berjalan di thread terpisah agar radar tidak lag"""
        if self.supabase:
            try:
                self.supabase.table(Config.TABLE_NAME).insert(payload).execute()
                # print(f"[CLOUD] Data Terkirim.") # Uncomment jika ingin log penuh
            except Exception as e:
                print(f"[CLOUD ERROR] {e}")

    def run(self):
        try:
            ser = serial.Serial(Config.SERIAL_PORT, baudrate=int(1e6), timeout=3)
            print(f"[INFO] Serial dibuka di {Config.SERIAL_PORT}")
        except Exception as e:
            print(f"[FATAL] Gagal buka serial port: {e}")
            return

        try:
            uRAD_USB_SDK11.turnON(ser)
            uRAD_USB_SDK11.loadConfiguration(ser, Config.MODE, Config.F0, Config.BW, 
                                             Config.NS, Config.NTAR, Config.RMAX, 
                                             Config.MTI, Config.MTH, Config.ALPHA, 
                                             Config.DISTANCE_TRUE, Config.VELOCITY_TRUE, 
                                             Config.SNR_TRUE, Config.I_TRUE, Config.Q_TRUE, 
                                             Config.MOVEMENT_TRUE)
            print(f"[INFO] Radar Aktif (Realtime Mode). Throttling: {Config.UPLOAD_INTERVAL}s")
            sleep(1)
        except Exception as e:
            print(f"[FATAL] Error Init Radar: {e}")
            ser.close()
            return

        # --- VARIABEL BUFFER SIGNAL PROCESSING ---
        complex_history_buffer = [] 
        
        # Variabel Hitung Sampling Rate Real-time
        sample_counter = 0
        t_last_rate_check = time()
        chirp_rate_calc = 20.0 
        
        # Timer Doppler & Upload
        t_start = time()
        t_last_upload = time()

        # Variabel Simpan Nilai Terakhir (Untuk jaga-jaga jika frame drop)
        last_valid_velocity = 0.0

        try:
            while self.running:
                # ---------------------------------------------------------
                # STEP 1: AKUISISI DATA
                # ---------------------------------------------------------
                return_code, results, raw_results = uRAD_USB_SDK11.detection(ser)
                
                if return_code != 0:
                    continue 

                # Hitung Real Sampling Rate
                sample_counter += 1
                BATCH_SIZE_CALC = 20
                if sample_counter >= BATCH_SIZE_CALC:
                    t_now = time()
                    dt_rate = t_now - t_last_rate_check
                    if dt_rate > 0:
                        chirp_rate_calc = BATCH_SIZE_CALC / dt_rate
                    sample_counter = 0
                    t_last_rate_check = t_now

                # Parsing Data
                NtarDetected = results[0]
                SNR_array = results[3]
                I_raw = raw_results[0]
                Q_raw = raw_results[1]
                
                current_snr_val = SNR_array[0] if NtarDetected > 0 else 0

                # ---------------------------------------------------------
                # STEP 2: PROSES JARAK (FFT 1)
                # ---------------------------------------------------------
                mag_spectrum, peak_idx, complex_val = process_range_fft(I_raw, Q_raw, Config.NS)
                
                # Masukkan ke Buffer Doppler
                complex_history_buffer.append(complex_val)
                if len(complex_history_buffer) > Config.HISTORY_LENGTH:
                    complex_history_buffer.pop(0)

                # Hitung Jarak Presisi (Interpolasi)
                exact_fft_index = get_interpolated_index(mag_spectrum, peak_idx)
                slant_distance = exact_fft_index * Config.RANGE_RES_CALIBRATED_M
                vertical_height = slant_distance * math.sin(sudut_rad)

                # Simpan snapshot raw data (setiap frame, ditimpa terus)
                self.last_raw_snapshot = {"I": I_raw, "Q": Q_raw}

                # ---------------------------------------------------------
                # STEP 3: PROSES KECEPATAN (FFT 2 / DOPPLER MANUAL)
                # ---------------------------------------------------------
                velocity_final = last_valid_velocity # Default pakai nilai lama
                
                # Hanya hitung jika buffer penuh
                if len(complex_history_buffer) == Config.HISTORY_LENGTH:
                    # Timer untuk sumbu frekuensi
                    t_stop = time()
                    
                    rate_for_fft = chirp_rate_calc 
                    t_start = t_stop 
                    
                    # FFT Kedua
                    arr_complex = np.array(complex_history_buffer)
                    fft2_result = fft(arr_complex * np.hanning(Config.HISTORY_LENGTH))
                    fft2_mag = np.abs(fft2_result[:Config.HISTORY_LENGTH//2])
                    doppler_freqs = fftfreq(Config.HISTORY_LENGTH, d=1/rate_for_fft)[:Config.HISTORY_LENGTH//2]
                    
                    # Cari Peak Doppler
                    valid_indices = np.where(doppler_freqs >= Config.MIN_DOPPLER_FREQ)[0]
                    if len(valid_indices) > 0:
                        sub_peak_idx = np.argmax(fft2_mag[valid_indices])
                        true_peak_idx = valid_indices[sub_peak_idx]
                        doppler_freq = doppler_freqs[true_peak_idx]
                        
                        # Hitung Velocity
                        v_angle = doppler_freq * lambda_wave / 2
                        velocity_final = v_angle / math.cos(sudut_rad)
                        last_valid_velocity = velocity_final

                # Print Status (Realtime Monitoring di Terminal)
                elapsed = time() - t_last_upload
                print(f"\r[LIVE] H:{vertical_height:.3f}m | V:{velocity_final:.3f}m/s | Rate:{chirp_rate_calc:.0f}Hz ", end="")

                # ---------------------------------------------------------
                # STEP 4: UPLOAD (REAL-TIME THROTTLED)
                # ---------------------------------------------------------
                # Cek apakah sudah 1 detik sejak upload terakhir?
                if elapsed > Config.UPLOAD_INTERVAL:
                    
                    # Filter noise ekstrim (misal jarak 0 atau negatif)
                    if vertical_height > 0.1:
                        
                        # Logika Moving Flag
                        is_moving = True if abs(velocity_final) > 0.02 else False
                        
                        # Payload Realtime
                        payload = {
                            "timestamp": datetime.utcnow().isoformat(),
                            "upload_id": Config.UPLOAD_ID,
                            "distance": round(float(vertical_height), 4),
                            "velocity": round(float(velocity_final), 4),
                            "discharge": round(float(vertical_height), 4), # Placeholder debit
                            "moving_flag": is_moving,
                            "raw_json": {
                                "mode": "realtime_fixed_mode2",
                                "chirp_rate": round(chirp_rate_calc, 2),
                                "snr": round(float(current_snr_val), 2),
                                "raw_i_sample": self.last_raw_snapshot["I"][:10],
                                "raw_q_sample": self.last_raw_snapshot["Q"][:10]
                            }
                        }
                        
                        # Kirim di Thread Terpisah
                        th = threading.Thread(target=self.send_data_worker, args=(payload,))
                        th.start()
                    
                    # Reset Timer Upload
                    t_last_upload = time()

        except KeyboardInterrupt:
            print("\n[INFO] Berhenti Manual.")
        except Exception as e:
            print(f"\n[ERROR] {e}")
        finally:
            if ser.is_open:
                uRAD_USB_SDK11.turnOFF(ser)
                ser.close()

if __name__ == "__main__":
    app = RadarRealtimeSystem()
    app.run()