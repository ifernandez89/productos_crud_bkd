import sys
import json
import time
import io
from faster_whisper import WhisperModel

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input file provided", "text": "", "confidence": 0}))
        sys.exit(1)

    input_file = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"
    language = sys.argv[3] if len(sys.argv) > 3 else "es"

    t0 = time.time()
    try:
        # compute_type='int8' is ultra-fast on CPU and uses <200MB RAM
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            input_file,
            language=language,
            beam_size=5,
            vad_filter=True, # Voice Activity Detection filters silence and background noise
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        segment_list = []
        full_text_parts = []
        confidences = []

        for seg in segments:
            clean_text = seg.text.strip()
            if clean_text:
                full_text_parts.append(clean_text)
                # avg_logprob -> approximate confidence between 0 and 1
                conf = max(0.0, min(1.0, 1.0 + (seg.avg_logprob / 2.5)))
                confidences.append(conf)
                segment_list.append({
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": clean_text,
                    "confidence": round(conf, 3)
                })

        full_text = " ".join(full_text_parts)
        avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.0
        duration_ms = int((time.time() - t0) * 1000)

        result = {
            "text": full_text,
            "confidence": avg_confidence,
            "durationMs": duration_ms,
            "engine": f"faster-whisper-{model_size}",
            "language": info.language,
            "languageProbability": round(info.language_probability, 3),
            "segments": segment_list
        }
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "text": "",
            "confidence": 0,
            "durationMs": int((time.time() - t0) * 1000),
            "engine": "whisper_error"
        }, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
