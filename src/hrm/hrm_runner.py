import sys
import json
import torch
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
    tokenizer = AutoTokenizer.from_pretrained("datificate/gpt2-small-spanish")
    tokenizer.pad_token = tokenizer.eos_token
    hrm_model = HRMModel(config_dict=config_dict)
    decoder_model = GPT2LMHeadModel.from_pretrained(
        "datificate/gpt2-small-spanish",
        torch_dtype=torch.float32
    )
    decoder_model.eval()
    debug_log("Modelos cargados correctamente.")
    return hrm_model, tokenizer, decoder_model

def generate_response(question, hrm_model, tokenizer, decoder_model, temperature=0.3, top_k=20):
    debug_log(f"HRM type: {type(hrm_model)}")
    test_output = hrm_model.initial_carry({"inputs": torch.tensor([[1, 2, 3]])})
    debug_log(f"Test carry: {test_output}")

    # Prompt más cerrado y claro
    prompt = (
        "Responde a la siguiente pregunta de forma breve, clara y profesional en español.\n\n"
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

    output = decoder_model.generate(
        inputs.input_ids,
        attention_mask=inputs.attention_mask,
        max_new_tokens=60,
        temperature=temperature,
        top_k=top_k,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id,
        eos_token_id=tokenizer.eos_token_id,
        no_repeat_ngram_size=3,
        early_stopping=True
    )

    full_response = tokenizer.decode(output[0], skip_special_tokens=True)

    # Limpieza de la respuesta
    if "Respuesta (máx. 3 frases):" in full_response:
        response_text = full_response.split("Respuesta (máx. 3 frases):")[-1].strip()
    else:
        response_text = full_response.strip()

    # Evitar que repita la pregunta o meta frases raras
    if "Pregunta:" in response_text:
        response_text = response_text.split("Pregunta:")[0].strip()

    return response_text

def main():
    torch.set_num_threads(2)

    try:
        hrm_model, tokenizer, decoder_model = load_models()

        if len(sys.argv) < 2:
            print(json.dumps({"error": "Se requiere una pregunta"}, ensure_ascii=False))
            return

        question = sys.argv[1].strip()

        temperature = float(sys.argv[2]) if len(sys.argv) > 2 else 0.3
        top_k = int(sys.argv[3]) if len(sys.argv) > 3 else 20

        response_text = generate_response(question, hrm_model, tokenizer, decoder_model, temperature, top_k)

        # Guardar respuesta en archivo (opcional)
        with open("ultima_respuesta.txt", "w", encoding="utf-8") as f:
            f.write(response_text)

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
            "advice": "Verifique los parámetros e intente nuevamente"
        }, ensure_ascii=False))

if __name__ == "__main__":
    main()
