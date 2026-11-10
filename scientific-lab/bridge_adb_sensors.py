import os
import sys
import time
import subprocess
import re
import json

ADB = os.path.abspath("tools/platform-tools/adb.exe")

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def adb_cmd(args):
    cmd = [ADB] + args
    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return res.stdout.strip()

def extract_sensor_events(sensor_header, dump):
    m = re.search(rf'{re.escape(sensor_header)}.*?\n(.*?)(?=\n[A-Za-z0-9_ -]+: last|\nActive sensors:|\Z)', dump, re.DOTALL)
    if not m:
        return []
    lines = m.group(1).strip().splitlines()
    res = []
    for l in lines:
        ev = re.search(r'\s*\d+\s+\(ts=([0-9.]+),\s+wall=([0-9:.]+)\)\s+([-\d., ]+)', l)
        if ev:
            vals = [float(x.strip()) for x in ev.group(3).split(',') if x.strip()]
            res.append((ev.group(1), ev.group(2), vals))
    return res

def run_bridge():
    import urllib.request
    try:
        import websocket
    except ImportError:
        # Fallback to local python websockets or raw socket
        pass

    print("=" * 65)
    print("🛰️ JARBEES HARDWARE SENSOR BRIDGE (ADB HAL -> FIELD LAB)")
    print("=" * 65)

    # Check device
    expected_serial = os.getenv("ADB_DEVICE_SERIAL", "").strip()
    devices = adb_cmd(["devices"])
    active_lines = [
        line for line in devices.splitlines()[1:]
        if "\tdevice" in line and (not expected_serial or expected_serial in line)
    ]
    if not active_lines:
        print("⚠️ Nodo móvil Android no detectado en modo ADB.")
        print("   Por favor, cambia en el celular el modo USB a 'Transferencia de archivos'.")
        return

    print("✅ Nodo móvil Android detectado por ADB. Conectando al bus de sensores...")
    # Keep sensors streaming
    adb_cmd(["shell", "monkey", "-p", "com.teacapps.barcodescanner", "-c", "android.intent.category.LAUNCHER", "1"])
    time.sleep(1.0)

    # WebSocket connection to server
    try:
        import websocket
        ws = websocket.WebSocket()
        ws.connect("ws://127.0.0.1:3333")
        print("✅ Conectado al servidor WebSocket en ws://127.0.0.1:3333")
    except Exception as e:
        print(f"⚠️ Error conectando WebSocket: {e}")
        return

    print("🟢 Transmitiendo datos crudos del magnetómetro de silicio...")
    t0 = time.time()
    count = 0

    try:
        while True:
            raw = adb_cmd(["shell", "dumpsys", "sensorservice"])
            mag_ev = extract_sensor_events('MAGNETOMETER: last 10 events', raw)
            acc_ev = extract_sensor_events('ICM-42607-P  ACCELEROMETER: last 50 events', raw)
            gyro_ev = extract_sensor_events('ICM-42607-P  GYROSCOPE: last 10 events', raw)

            if mag_ev:
                count += 1
                bx, by, bz = mag_ev[-1][2][:3]
                ax, ay, az = acc_ev[-1][2][:3] if acc_ev else [0, 0, 9.8]
                gx, gy, gz = gyro_ev[-1][2][:3] if gyro_ev else [0, 0, 0]

                payload = {
                    "type": "telemetry",
                    "ts": int(time.time() * 1000),
                    "mag": [bx, by, bz],
                    "acc": [ax, ay, az],
                    "gyro": [gx, gy, gz],
                    "source": "HARDWARE_ADB_HAL"
                }

                ws.send(json.dumps(payload))

                norm = (bx**2 + by**2 + bz**2)**0.5
                print(f"[# {count:04d}] B = {norm:6.1f} µT | Bx={bx:+6.1f}, By={by:+6.1f}, Bz={bz:+6.1f} µT", end="\r", flush=True)

            time.sleep(0.04)
    except KeyboardInterrupt:
        print("\nPuente detenido.")
    finally:
        ws.close()

if __name__ == "__main__":
    run_bridge()
