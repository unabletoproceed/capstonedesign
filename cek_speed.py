import uRAD_USB_SDK11
import serial
import time
import math

# KONFIGURASI
SERIAL_PORT = '/dev/ttyACM0'  # Cek apakah ACM0 atau USB0
F0 = 5                        # Frekuensi standar
C_LIGHT = 3e8
LAMBDA = C_LIGHT / ((24.005 + F0/1000) * 1e9) # Panjang gelombang (0.0125 m)

print("="*50)
print("   DIAGNOSA KEMAMPUAN SAMPLING RASPBERRY PI   ")
print("="*50)

try:
    # 1. Buka Serial
    ser = serial.Serial(SERIAL_PORT, baudrate=int(1e6), timeout=3)
    
    # 2. Nyalakan Radar di Mode 2 (Raw Data - Mode Terberat)
    uRAD_USB_SDK11.turnON(ser)
    uRAD_USB_SDK11.loadConfiguration(ser, mode=2, f0=F0, bw=240, ns=200, ntar=1, rmax=100, 
                                     mti=0, mth=0, alpha=10, distance_true=False, velocity_true=False, 
                                     snr_true=True, i_true=True, q_true=True, movement_true=False)
    
    print("\n[INFO] Radar Aktif. Memulai Stress Test...")
    print("[INFO] Mengambil 100 sampel secepat mungkin...")
    
    # 3. STRESS TEST LOOP
    timestamps = []
    start_total = time.time()
    
    for i in range(100):
        t_loop_start = time.time()
        
        # Ambil data (Fungsi ini yang memakan waktu paling lama)
        uRAD_USB_SDK11.detection(ser)
        
        t_loop_end = time.time()
        timestamps.append(t_loop_end - t_loop_start)
        
        # Print progress bar kecil
        if i % 10 == 0: print(".", end="", flush=True)

    total_duration = time.time() - start_total
    print("\n\n[INFO] Selesai.")
    
    # 4. HITUNG HASIL
    avg_dt = sum(timestamps) / len(timestamps) # Rata-rata waktu per data
    real_hz = 1.0 / avg_dt                     # Sampling Rate (Hz)
    
    # Hitung Batas Nyquist (Kecepatan Maksimum Air yang bisa dibaca)
    # Rumus: Vmax = Lambda / (4 * dt)
    v_max_theoretical = LAMBDA / (4 * avg_dt)
    
    print("-" * 50)
    print(f"HASIL AKHIR:")
    print(f"Total Waktu (100 Data) : {total_duration:.4f} detik")
    print(f"Rata-rata Latensi (dt) : {avg_dt*1000:.2f} ms")
    print(f"SAMPLING RATE          : {real_hz:.2f} Hz")
    print("-" * 50)
    print(f"BATAS KECEPATAN FISIKA (Nyquist Limit):")
    print(f"Maksimal Flow Air: {v_max_theoretical:.4f} m/s")
    print("-" * 50)
    
    # 5. KESIMPULAN OTOMATIS
    if v_max_theoretical < 0.2:
        print("KESIMPULAN: MERAH (BAHAYA)")
        print("Sistem terlalu lambat untuk sungai. Gunakan Hybrid Mode/Internal Processing.")
    elif v_max_theoretical < 1.0:
        print("KESIMPULAN: KUNING (WASPADA)")
        print("Bisa untuk air lambat, tapi air deras akan error (aliasing).")
    else:
        print("KESIMPULAN: HIJAU (AMAN)")
        print("Sistem sangat cepat. Metode 2x FFT Dosbing aman digunakan.")
    print("="*50)

    uRAD_USB_SDK11.turnOFF(ser)
    ser.close()

except Exception as e:
    print(f"\n[ERROR] {e}")
    print("Pastikan port benar dan radar tercolok.")