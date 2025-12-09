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
    # Pastikan port ini benar (bisa /dev/ttyACM0 atau /dev/ttyUSB0)
    SERIAL_PORT = '/dev/ttyACM0'  
    
    # --- Supabase Configuration ---
    SUPABASE_URL = "https://ohbpqbhphpdlqzdnvtov.supabase.co"
    SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYnBxYmhwaHBkbHF6ZG52dG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODM0MTIsImV4cCI6MjA3OTI1OTQxMn0.wh_4j201Ci6C3cR-gCnwwe6mt3hyS_BAqs_7mExezqY" 
    TABLE_NAME = "radar_data"
    
    # --- Session ID ---
    UPLOAD_ID = str(uuid.uuid4())
    
    # --- Timing Strategy ---
    # Kirim data setiap 1 detik agar tidak spam database
    UPLOAD_INTERVAL = 1.0   

    # --- Parameter Radar (Fixed Mode 2) ---
    MODE = 2
    F0 = 5          
    BW = 240        
    NS = 50        
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
    SUDUT_DEPRESI = 35  # Derajat kemiringan radar
    C_LIGHT = 3e8
    RANGE_RES_CALIBRATED_MM = 560.0  
    RANGE_RES_CALIBRATED_M = RANGE_RES_CALIBRATED_MM / 1000.0 
    
    # Processing
    HISTORY_LENGTH = 256  # Panjang Buffer Doppler
    MIN_DOPPLER_FREQ = 3  # Filter frekuensi rendah (noise lantai)

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
    
    # Cari puncak (Range Bin), abaikan DC (index 0-1)
    search_area = magnitude[2:int(Ns/2)] 
    if len(search_area) == 0:
        return magnitude, 0, 0j
        
    peak_local_index = np.argmax(search_area)
    peak_real_index = peak_local_index + 2 # Offset karena start dari index 2
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
class RadarLogger:
    def __init__(self):
        self.running = True
        
        # Init Supabase
        try:
            self.supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
            print(f"[INFO] Session ID: {Config.UPLOAD_ID}")
        except Exception as e:
            print(f"[ERROR] Gagal init Supabase: {e}")
            self.supabase = None
        
    def send_data_worker(self, payload):
        """Thread terpisah untuk upload data"""
        if self.supabase:
            try:
                self.supabase.table(Config.TABLE_NAME).insert(payload).execute()
                # print("[CLOUD] Data sent.") 
            except Exception as e:
                print(f"[CLOUD ERROR] {e}")

    def run(self):
        # Buka Serial Port
        try:
            ser = serial.Serial(Config.SERIAL_PORT, baudrate=int(1e6), timeout=3)
            print(f"[INFO] Serial dibuka di {Config.SERIAL_PORT}")
        except Exception as e:
            print(f"[FATAL] Gagal buka serial port: {e}")
            return

        # Init Radar
        try:
            uRAD_USB_SDK11.turnON(ser)
            uRAD_USB_SDK11.loadConfiguration(ser, Config.MODE, Config.F0, Config.BW, 
                                             Config.NS, Config.NTAR, Config.RMAX, 
                                             Config.MTI, Config.MTH, Config.ALPHA, 
                                             Config.DISTANCE_TRUE, Config.VELOCITY_TRUE, 
                                             Config.SNR_TRUE, Config.I_TRUE, Config.Q_TRUE, 
                                             Config.MOVEMENT_TRUE)
            print(f"[INFO] Radar Aktif. Upload Interval: {Config.UPLOAD_INTERVAL}s")
            sleep(1)
        except Exception as e:
            print(f"[FATAL] Error Init Radar: {e}")
            ser.close()
            return

        # --- VARIABEL BUFFER SIGNAL PROCESSING ---
        complex_history_buffer = [] 
        
        # Variabel Hitung Sampling Rate Real-time (PENTING untuk Doppler)
        sample_counter = 0
        t_last_rate_check = time()
        chirp_rate_calc = 20.0 # Nilai awal default
        
        # Timer & Buffer Data
        t_last_upload = time()
        last_doppler_freq = 0.0
        last_velocity = 0.0

        try:
            while self.running:
                # ---------------------------------------------------------
                # STEP 1: AKUISISI DATA
                # ---------------------------------------------------------
                return_code, results, raw_results = uRAD_USB_SDK11.detection(ser)
                
                if return_code != 0:
                    continue 

                # --- HITUNG REAL SAMPLING RATE (Batch 20) ---
                # Logika ini diambil dari kode Windows agar Doppler akurat
                sample_counter += 1
                BATCH_SIZE_CALC = 20
                if sample_counter >= BATCH_SIZE_CALC:
                    t_now = time()
                    dt_rate = t_now - t_last_rate_check
                    if dt_rate > 0:
                        chirp_rate_calc = BATCH_SIZE_CALC / dt_rate
                    sample_counter = 0
                    t_last_rate_check = t_now
                # --------------------------------------------

                # Parsing Data
                NtarDetected = results[0]
                I_raw = raw_results[0]
                Q_raw = raw_results[1]
                
                # ---------------------------------------------------------
                # STEP 2: PROSES JARAK (Range FFT)
                # ---------------------------------------------------------
                mag_spectrum, peak_idx, complex_val = process_range_fft(I_raw, Q_raw, Config.NS)
                
                # Masukkan complex value target ke buffer Doppler
                complex_history_buffer.append(complex_val)
                if len(complex_history_buffer) > Config.HISTORY_LENGTH:
                    complex_history_buffer.pop(0)

                # Hitung Jarak & Index Presisi
                exact_fft_index = get_interpolated_index(mag_spectrum, peak_idx)
                slant_distance = exact_fft_index * Config.RANGE_RES_CALIBRATED_M
                vertical_height = slant_distance * math.sin(sudut_rad)

                # ---------------------------------------------------------
                # STEP 3: PROSES KECEPATAN (Doppler FFT)
                # ---------------------------------------------------------
                # Hanya proses jika buffer penuh (256 sample)
                if len(complex_history_buffer) == Config.HISTORY_LENGTH:
                    
                    # 1. Tentukan Sampling Rate untuk FFT
                    rate_for_fft = chirp_rate_calc if chirp_rate_calc > 0 else 180.0
                    
                    # 2. Ambil data buffer
                    arr_complex = np.array(complex_history_buffer)
                    
                    # 3. Clutter Removal (PENTING: Hapus DC Offset)
                    arr_complex_no_dc = arr_complex - np.mean(arr_complex)
                    
                    # 4. FFT Doppler
                    fft2_result = fft(arr_complex_no_dc * np.hanning(Config.HISTORY_LENGTH))
                    fft2_mag = np.abs(fft2_result[:Config.HISTORY_LENGTH//2])
                    doppler_freqs = fftfreq(Config.HISTORY_LENGTH, d=1/rate_for_fft)[:Config.HISTORY_LENGTH//2]
                    
                    # 5. Cari Peak Doppler
                    valid_indices = np.where(doppler_freqs >= Config.MIN_DOPPLER_FREQ)[0]
                    if len(valid_indices) > 0:
                        sub_peak_idx = np.argmax(fft2_mag[valid_indices])
                        true_peak_idx = valid_indices[sub_peak_idx]
                        
                        doppler_freq = doppler_freqs[true_peak_idx]
                        
                        # Hitung Velocity
                        v_angle = doppler_freq * lambda_wave / 2
                        velocity_calc = v_angle / math.cos(sudut_rad)
                        
                        # Simpan hasil terbaru
                        last_doppler_freq = doppler_freq
                        last_velocity = velocity_calc
                    else:
                        last_doppler_freq = 0.0
                        last_velocity = 0.0

                # Print Monitoring Singkat
                print(f"\r[RADAR] Rate:{chirp_rate_calc:.0f}Hz | H:{vertical_height:.3f}m | V:{last_velocity:.3f}m/s | Freq:{last_doppler_freq:.2f}Hz   ", end="")

                # ---------------------------------------------------------
                # STEP 4: UPLOAD KE SUPABASE
                # ---------------------------------------------------------
                elapsed = time() - t_last_upload
                if elapsed > Config.UPLOAD_INTERVAL:
                    
                    # Siapkan Payload Lengkap (Sesuai request)
                    payload = {
                        "timestamp": datetime.utcnow().isoformat(),
                        "upload_id": Config.UPLOAD_ID,
                        
                        # --- Kolom Lama (Agar dashboard yg sudah ada tidak error) ---
                        "distance": round(float(vertical_height), 4),
                        "velocity": round(float(last_velocity), 4),
                        "moving_flag": True if abs(last_velocity) > 0.05 else False,
                        
                        # --- Kolom Baru (Untuk Analisis CSV Mendalam) ---
                        "exact_range_index": round(float(exact_fft_index), 4),
                        "water_height_m": round(float(vertical_height), 4),     # Sama dengan distance, tapi nama lebih jelas
                        "velocity_m_s": round(float(last_velocity), 4),         # Sama dengan velocity
                        "doppler_freq_hz": round(float(last_doppler_freq), 4),  # INI PENTING untuk analisis Doppler
                        "chirp_rate_hz": round(chirp_rate_calc, 2),
                        "is_stable": True if chirp_rate_calc > 10 else False,
                        
                        # Raw JSON (Opsional, simpan SNR disini)
                        "raw_json": {
                            "mode": "logging_v2",
                            "snr_db": round(float(results[3][0]), 2) if results[0] > 0 else 0
                        }
                    }
                    
                    # Kirim Background
                    th = threading.Thread(target=self.send_data_worker, args=(payload,), daemon=True)
                    th.start()
                    
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
    app = RadarLogger()
    app.run()