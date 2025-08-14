import sys
import json
import torch
from transformers import AutoTokenizer, GPT2LMHeadModel
from hrm_act_v1 import HierarchicalReasoningModel_ACTV1 as HRMModel

# Configuración completa
config_dict = {
    "batch_size": 1,
    "seq_len": 32,
    "puzzle_emb_ndim": 0,
    "num_puzzle_identifiers": 0,
    "vocab_size": 50257,
    "H_cycles": 2,
    "L_cycles": 2,
    "H_layers": 2,
    "L_layers": 2,
    "hidden_size": 768,
    "expansion": 4,
    "num_heads": 12,
    "pos_encodings": "rope",
    "halt_max_steps": 5,
    "halt_exploration_prob": 0.1,
    "dropout_rate": 0.1
}

# Inicialización de modelos
hrm_model = HRMModel(config_dict=config_dict)
tokenizer = AutoTokenizer.from_pretrained("gpt2")
tokenizer.pad_token = tokenizer.eos_token
decoder_model = GPT2LMHeadModel.from_pretrained("gpt2")

def generate_response(question, temperature=0.7, top_k=50):
    # Crear prompt más estructurado
    prompt = f"Por favor responde concisamente a la siguiente pregunta.\nPregunta: {question}\nRespuesta:"
    
    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        padding="max_length",
        truncation=True,
        max_length=config_dict["seq_len"]
    )
    
    batch = {
        "inputs": inputs["input_ids"],
        "puzzle_identifiers": torch.empty((1, 0))
    }
    
    with torch.no_grad():
        carry = hrm_model.initial_carry(batch)
        carry, outputs = hrm_model(carry, batch)
        
        # Generación con parámetros optimizados
        generated = decoder_model.generate(
            inputs["input_ids"],
            attention_mask=inputs["attention_mask"],
            max_new_tokens=50,
            temperature=temperature,
            top_k=top_k,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
            no_repeat_ngram_size=2,  # Evitar repeticiones
        )
        
    # Procesamiento mejorado de la respuesta
    full_response = tokenizer.decode(generated[0], skip_special_tokens=True)
    response = full_response.replace(prompt, "").strip()
    
    # Limpieza adicional
    if "Pregunta:" in response:
        response = response.split("Pregunta:")[0].strip()
    if "\n" in response:
        response = response.split("\n")[0].strip()
    
    return response if response else "No pude generar una respuesta adecuada."

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Se requiere una pregunta"}, ensure_ascii=False))
        return
    
    question = sys.argv[1]
    temperature = float(sys.argv[2]) if len(sys.argv) > 2 else 0.3  # Valor más bajo por defecto
    top_k = int(sys.argv[3]) if len(sys.argv) > 3 else 30  # Valor más bajo por defecto
    
    response = generate_response(question, temperature, top_k)
    
    print(json.dumps({
        "pregunta": question,
        "respuesta": response,
        "parametros": {
            "temperature": temperature,
            "top_k": top_k
        }
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()