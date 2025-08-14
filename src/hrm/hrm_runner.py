import sys
import json
import torch
import time
from transformers import AutoTokenizer, GPT2LMHeadModel
from hrm_act_v1 import HierarchicalReasoningModel_ACTV1 as HRMModel

# Configuración del HRM
config_dict = {
    "batch_size": 1,
    "seq_len": 64,
    "puzzle_emb_ndim": 0,
    "num_puzzle_identifiers": 0,
    "vocab_size": 50257,
    "H_cycles": 2,
    "L_cycles": 1,
    "H_layers": 2,
    "L_layers": 1,
    "hidden_size": 512,
    "expansion": 2,
    "num_heads": 8,
    "pos_encodings": "rope",
    "halt_max_steps": 3,
    "halt_exploration_prob": 0.05,
    "dropout_rate": 0.1
}

def debug_log(message: str):
    """Imprime mensajes de depuración en stderr para no romper el JSON en stdout."""
    sys.stderr.write(f"{message}\n")
    sys.stderr.flush()

def load_models():
    debug_log("Cargando tokenizer y modelos en español...")
    start_time = time.time()
    tokenizer = AutoTokenizer.from_pretrained("datificate/gpt2-small-spanish")
    tokenizer.pad_token = tokenizer.eos_token
    hrm_model = HRMModel(config_dict=config_dict)
    decoder_model = GPT2LMHeadModel.from_pretrained(
        "datificate/gpt2-small-spanish",
        torch_dtype=torch.float32
    )
    decoder_model.eval()
    debug_log(f"Modelos cargados correctamente en {time.time() - start_time:.2f} segundos.")
    return hrm_model, tokenizer, decoder_model

def is_generic_response(response_text: str) -> bool:
    """Valida si la respuesta es genérica, poco útil o incoherente."""
    generic_keywords = [
        "no tengo suficiente información",
        "no estoy seguro",
        "no puedo responder",
        "la respuesta de la red neuronal",
        "los algoritmos de búsqueda",
        "la función específica",
        "el comportamiento de una red",
        "la conducta de una persona",
        "el algoritmo de búsqueda",
        "no se pudo generar",
        "la red neuronal está compuesta",
    ]
    return any(keyword in response_text.lower() for keyword in generic_keywords)

def generate_response(question, hrm_model, tokenizer, decoder_model, temperature=0.3, top_k=20):
    debug_log(f"Generando respuesta para: {question}")
    start_time = time.time()

    # Prompt especializado en soporte técnico
    prompt = (
        "Eres un asistente virtual especializado en soporte técnico informático. "
        "Responde SIEMPRE en español, de forma clara, breve y profesional. "
        "Si no conoces la respuesta, indica que no estás seguro. "
        "Evita divagar o inventar información.\n\n"
        f"Pregunta: {question}\n"
        "Respuesta (máx. 3 frases):"
    )

    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        max_length=config_dict["seq_len"],
        truncation=True,
        padding="max_length"
    )

    # Reducir max_new_tokens para respuestas más rápidas
    output = decoder_model.generate(
        inputs.input_ids,
        attention_mask=inputs.attention_mask,
        max_new_tokens=30,  # Reducido de 60 a 30
        temperature=temperature,
        top_k=top_k,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id,
        eos_token_id=tokenizer.eos_token_id,
        no_repeat_ngram_size=3,
        early_stopping=True
    )

    full_response = tokenizer.decode(output[0], skip_special_tokens=True)
    debug_log(f"Respuesta completa generada en {time.time() - start_time:.2f} segundos.")

    # Limpieza de la respuesta
    if "Respuesta (máx. 3 frases):" in full_response:
        response_text = full_response.split("Respuesta (máx. 3 frases):")[-1].strip()
    else:
        response_text = full_response.strip()

    # Evitar que repita la pregunta o meta frases raras
    if "Pregunta:" in response_text:
        response_text = response_text.split("Pregunta:")[0].strip()

    # Validar si la respuesta es genérica o poco útil
    if not response_text.strip() or is_generic_response(response_text):
        response_text = (
            "No tengo suficiente información para responder tu pregunta. "
            "Por favor, contacta a soporte técnico para ayuda especializada."
        )

    debug_log(f"Tiempo total de generación: {time.time() - start_time:.2f} segundos.")
    return response_text

def main():
    torch.set_num_threads(1)  # Reducir hilos de CPU para evitar bloqueos
    try:
        hrm_model, tokenizer, decoder_model = load_models()
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Se requiere una pregunta"}, ensure_ascii=False))
            return
        question = sys.argv[1].strip()
        temperature = float(sys.argv[2]) if len(sys.argv) > 2 else 0.3
        top_k = int(sys.argv[3]) if len(sys.argv) > 3 else 20
        response_text = generate_response(question, hrm_model, tokenizer, decoder_model, temperature, top_k)
        print(json.dumps({
            "response": response_text,
            "parameters": {
                "temperature": temperature,
                "top_k": top_k
            }
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "advice": "Verifica los parámetros e intenta nuevamente."
        }, ensure_ascii=False))

if __name__ == "__main__":
    main()
