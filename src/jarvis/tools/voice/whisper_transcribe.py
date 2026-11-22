import sys
import os
import glob
import site
import json
import time
import io

# Evitar bloqueos de hf_xet en Windows cuando Hugging Face descarga pesos nuevos
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")


def register_windows_cuda_dll_dirs():
    """
    Registra directorios con librerías CUDA 12 (cublas64_12.dll, cublasLt64_12.dll, cudnn)
    presentes en el host Windows (site-packages nvidia/*, CUDA Toolkit y runtime CUDA de Ollama)
    antes de inicializar CTranslate2/Faster-Whisper en la RTX 5070.
    """
    if sys.platform != "win32":
        return []

    candidate_dirs = []
    env_cuda_dir = os.environ.get("JARVIS_CUDA_BIN_DIR")
    if env_cuda_dir:
        candidate_dirs.append(env_cuda_dir)

    # 1. Paquetes Python nvidia-cublas-cu12 / nvidia-cudnn-cu12 si están instalados
    site_roots = []
    try:
        site_roots.extend(site.getsitepackages())
    except Exception:
        pass
    try:
        site_roots.append(site.getusersitepackages())
    except Exception:
        pass
    for root in site_roots:
        if not root:
            continue
        for sub in ("nvidia\\cublas\\bin", "nvidia\\cudnn\\bin", "nvidia\\cuda_runtime\\bin"):
            candidate_dirs.append(os.path.join(root, sub))

    # 2. NVIDIA CUDA Toolkit v12.x estándar
    for p in sorted(glob.glob(r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.*\bin"), reverse=True):
        candidate_dirs.append(p)

    # 3. Runtime CUDA v12 ya instalado por Ollama en Windows
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        candidate_dirs.append(os.path.join(local_app_data, "Programs", "Ollama", "lib", "ollama", "cuda_v12"))
        candidate_dirs.append(os.path.join(local_app_data, "Programs", "Ollama", "lib", "ollama"))

    registered = []
    current_path = os.environ.get("PATH", "")
    for d in candidate_dirs:
        if d and os.path.isdir(d) and d not in registered:
            try:
                if hasattr(os, "add_dll_directory"):
                    os.add_dll_directory(d)
                if d.lower() not in current_path.lower():
                    current_path = d + os.pathsep + current_path
                registered.append(d)
            except Exception:
                pass
    os.environ["PATH"] = current_path
    return registered


CUDA_DLL_DIRS = register_windows_cuda_dll_dirs()

import ctranslate2
from faster_whisper import WhisperModel

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

DEFAULT_RIOPLATENSE_PROMPT = (
    "Conversación en español rioplatense de Argentina con el asistente JarBees. "
    "Consultas y comandos de voz: buscá e ingestá información, adquirí o incorporá autores y personajes a la biblioteca o base de datos. "
    "Temas frecuentes: salud, ayuno, plantas medicinales, tarot, simbología, historia, ciencia, filosofía, programación y nombres propios. "
    "Deletreo del abecedario español letra por letra: "
    "a, be, ce, de, e, efe, ge, hache, i, jota, ka, ele, eme, ene, eñe, o, pe, cu, "
    "erre, ese, te, u, ve, doble ve, equis, i griega, zeta."
)


def get_device_candidates(requested_device: str, requested_compute: str):
    cuda_available = False
    try:
        cuda_available = ctranslate2.get_cuda_device_count() > 0
    except Exception:
        cuda_available = False

    candidates = []
    if requested_device == "cpu":
        candidates.append(("cpu", requested_compute or "int8"))
    elif requested_device == "cuda" or (requested_device == "auto" and cuda_available):
        if requested_compute:
            candidates.append(("cuda", requested_compute))
        else:
            candidates.append(("cuda", "float16"))
            candidates.append(("cuda", "int8_float16"))
        candidates.append(("cpu", "int8"))
    else:
        candidates.append(("cpu", requested_compute or "int8"))
    return candidates


def load_whisper_model_for_target(model_size: str, device: str, compute_type: str):
    """
    Carga Faster-Whisper priorizando caché local 100% offline (local_files_only=True)
    y descargando solo si aún no existe en disco.
    """
    try:
        return WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            local_files_only=True,
        )
    except Exception:
        return WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
        )


def run_transcribe(model: WhisperModel, input_file: str, language: str, prompt: str, use_vad: bool):
    kwargs = dict(
        language=language,
        beam_size=5,
        best_of=5,
        temperature=[0.0, 0.2, 0.4],
        condition_on_previous_text=False,
        initial_prompt=prompt,
        vad_filter=use_vad,
    )
    if use_vad:
        # Parámetros suaves para no recortar vocales aisladas ni pausas al deletrear
        kwargs["vad_parameters"] = dict(
            threshold=0.35,
            min_speech_duration_ms=120,
            min_silence_duration_ms=700,
            speech_pad_ms=300,
        )

    segments_gen, info = model.transcribe(input_file, **kwargs)
    segment_list = []
    full_text_parts = []
    confidences = []
    logprobs = []
    no_speech_probs = []

    for seg in segments_gen:
        clean_text = seg.text.strip()
        if clean_text:
            full_text_parts.append(clean_text)
            conf = max(0.0, min(1.0, 1.0 + (seg.avg_logprob / 2.5)))
            confidences.append(conf)
            logprobs.append(seg.avg_logprob)
            no_speech_probs.append(getattr(seg, "no_speech_prob", 0.0))
            segment_list.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": clean_text,
                "confidence": round(conf, 3),
                "avgLogprob": round(seg.avg_logprob, 3),
                "noSpeechProb": round(getattr(seg, "no_speech_prob", 0.0), 3),
            })

    full_text = " ".join(full_text_parts).strip()
    avg_confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.0
    avg_logprob = round(sum(logprobs) / len(logprobs), 3) if logprobs else -1.0
    avg_no_speech = round(sum(no_speech_probs) / len(no_speech_probs), 3) if no_speech_probs else 1.0

    return {
        "text": full_text,
        "confidence": avg_confidence,
        "avgLogprob": avg_logprob,
        "noSpeechProb": avg_no_speech,
        "language": info.language,
        "languageProbability": round(info.language_probability, 3),
        "segments": segment_list,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input file provided", "text": "", "confidence": 0}))
        sys.exit(1)

    input_file = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else os.environ.get("JARVIS_WHISPER_MODEL", "large-v3-turbo")
    language = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else "es"
    custom_prompt = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else os.environ.get("JARVIS_WHISPER_PROMPT", DEFAULT_RIOPLATENSE_PROMPT)
    requested_device = os.environ.get("JARVIS_WHISPER_DEVICE", "auto").strip().lower()
    requested_compute = os.environ.get("JARVIS_WHISPER_COMPUTE_TYPE", "").strip().lower()

    t0 = time.time()
    try:
        candidates = get_device_candidates(requested_device, requested_compute)
        decoded = None
        active_device = "none"
        active_compute = "none"
        load_ms = 0
        decode_ms = 0
        retried_without_vad = False
        last_err = None

        for device, compute_type in candidates:
            try:
                t_load = time.time()
                model = load_whisper_model_for_target(model_size, device, compute_type)
                load_ms = int((time.time() - t_load) * 1000)

                t_dec = time.time()
                decoded = run_transcribe(model, input_file, language, custom_prompt, use_vad=True)
                retried_without_vad = False

                # Reintento automático sin VAD si el audio es muy corto o se recortaron letras aisladas
                if not decoded["text"] or (decoded["confidence"] < 0.55 and len(decoded["text"]) < 25):
                    retry = run_transcribe(model, input_file, language, custom_prompt, use_vad=False)
                    if retry["text"] and (not decoded["text"] or retry["confidence"] >= decoded["confidence"]):
                        decoded = retry
                        retried_without_vad = True

                decode_ms = int((time.time() - t_dec) * 1000)
                active_device = device
                active_compute = compute_type
                break
            except Exception as candidate_err:
                last_err = candidate_err
                decoded = None
                continue

        if decoded is None:
            raise RuntimeError(f"Todos los backends fallaron para {model_size}: {last_err}")

        duration_ms = int((time.time() - t0) * 1000)

        result = {
            "text": decoded["text"],
            "confidence": decoded["confidence"],
            "avgLogprob": decoded["avgLogprob"],
            "noSpeechProb": decoded["noSpeechProb"],
            "lowConfidence": decoded["confidence"] < 0.78,
            "durationMs": duration_ms,
            "loadMs": load_ms,
            "decodeMs": decode_ms,
            "engine": f"faster-whisper-{model_size}",
            "model": model_size,
            "device": active_device,
            "computeType": active_compute,
            "retriedWithoutVad": retried_without_vad,
            "language": decoded["language"],
            "languageProbability": decoded["languageProbability"],
            "segments": decoded["segments"],
        }
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "text": "",
            "confidence": 0,
            "durationMs": int((time.time() - t0) * 1000),
            "engine": "whisper_error",
            "device": "none",
            "computeType": "none",
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
