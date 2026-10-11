import os
import sys
import json
import argparse
import time
from faster_whisper import WhisperModel

def transcribe_file(input_path: str, output_json_path: str, model_size: str = "base"):
    if not os.path.exists(input_path):
        print(json.dumps({"error": f"Input file not found: {input_path}"}))
        sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(output_json_path)), exist_ok=True)
    txt_path = os.path.splitext(output_json_path)[0] + ".txt"

    # Rule: Check if cache already exists
    if os.path.exists(output_json_path) and os.path.getsize(output_json_path) > 0:
        with open(output_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            print(json.dumps({"status": "cached", "data": data}))
            return

    start_time = time.time()
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, info = model.transcribe(input_path, language="es", beam_size=3)

    collected_segments = []
    full_text_parts = []

    # Incremental write to disk
    with open(txt_path, "w", encoding="utf-8") as txt_file:
        for seg in segments:
            seg_data = {
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip()
            }
            collected_segments.append(seg_data)
            full_text_parts.append(seg.text.strip())
            txt_file.write(f"[{seg.start:.2f} - {seg.end:.2f}] {seg.text.strip()}\n")
            txt_file.flush()

    total_duration = time.time() - start_time
    full_text = " ".join(full_text_parts)

    result_data = {
        "source": input_path,
        "language": info.language,
        "audioDurationSec": round(info.duration, 2),
        "transcriptionDurationSec": round(total_duration, 2),
        "segmentCount": len(collected_segments),
        "fullText": full_text,
        "segments": collected_segments
    }

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2)

    print(json.dumps({
        "status": "success",
        "audioDurationSec": round(info.duration, 2),
        "transcriptionDurationSec": round(total_duration, 2),
        "charCount": len(full_text),
        "jsonPath": output_json_path,
        "txtPath": txt_path
    }))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcribe audiobook using faster-whisper")
    parser.add_argument("--input", required=True, help="Input audio file path")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument("--model", default="base", help="Model size: tiny, base, small, medium")
    args = parser.parse_args()

    transcribe_file(args.input, args.output, args.model)
