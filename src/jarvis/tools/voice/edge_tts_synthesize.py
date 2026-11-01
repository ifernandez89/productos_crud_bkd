import sys
import asyncio
import edge_tts
import os
import base64

async def synthesize(text, output_path, voice='es-AR-TomasNeural', rate='+0%', volume='+0%'):
    communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume)
    await communicate.save(output_path)

def main():
    if len(sys.argv) < 3:
        print("Usage: python edge_tts_synthesize.py <text_or_b64_or_file> <output_path> [voice] [rate] [volume]")
        sys.exit(1)

    input_arg = sys.argv[1]
    output_path = sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else os.environ.get('JARVIS_TTS_VOICE', 'es-AR-TomasNeural')
    rate = sys.argv[4] if len(sys.argv) > 4 else '+0%'
    volume = sys.argv[5] if len(sys.argv) > 5 else '+0%'

    if os.path.exists(input_arg) and os.path.isfile(input_arg):
        with open(input_arg, 'r', encoding='utf-8') as f:
            text = f.read()
    elif input_arg.startswith('base64:'):
        b64_str = input_arg[7:]
        text = base64.b64decode(b64_str).decode('utf-8')
    else:
        text = input_arg

    if not text.strip():
        print("Error: Empty text to synthesize")
        sys.exit(1)

    asyncio.run(synthesize(text, output_path, voice, rate, volume))
    print(f"OK: Synthesized to {output_path}")

if __name__ == "__main__":
    main()
