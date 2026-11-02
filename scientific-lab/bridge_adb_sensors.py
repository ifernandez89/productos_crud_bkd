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

def get_latest_hardware_reading():
    raw = adb_cmd(["shell", "dumpsys", "sensorservice"])
    acc = extract_sensor_events('ICM-42607-P  ACCELEROMETER: last 50 events', raw)
    gyro = extract_sensor_events('ICM-42607-P  GYROSCOPE: last 10 events', raw)
    mag = extract_sensor_events('MAGNETOMETER: last 10 events', raw)

    return {
        "acc": acc[-1][2] if acc else [0, 0, 9.8],
        "gyro": gyro[-1][2] if gyro else [0, 0, 0],
        "mag": mag[-1][2] if mag else [0, 0, 0],
        "wall": acc[-1][1] if acc else ""
    }

if __name__ == "__main__":
    print("Iniciando puente de hardware ADB Sensor Bridge...")
    data = get_latest_hardware_reading()
    print("Lectura actual del hardware:", json.dumps(data, indent=2))

