import sys
import json
import torch
from hrm_act_v1 import HierarchicalReasoningModel_ACTV1 as HRMModel

config_dict = {
    "batch_size": 1,
    "seq_len": 128,
    "puzzle_emb_ndim": 0,
    "num_puzzle_identifiers": 0,
    "vocab_size": 50257,
    "H_cycles": 2,
    "L_cycles": 2,
    "H_layers": 2,
    "L_layers": 2,
    "hidden_size": 512,
    "expansion": 4,
    "num_heads": 8,
    "pos_encodings": "rope",
    "halt_max_steps": 5,
    "halt_exploration_prob": 0.1,
}

model = HRMModel(config_dict=config_dict)
model.eval()

if __name__ == "__main__":
    question = sys.argv[1]

    # Tokenización básica (ejemplo)
    input_ids = torch.tensor([[1, 234, 567, 890]])
    padded_input_ids = torch.zeros(1, config_dict["seq_len"], dtype=torch.long)
    padded_input_ids[0, :input_ids.shape[1]] = input_ids

    batch = {
        "inputs": padded_input_ids,
        "puzzle_identifiers": torch.tensor([[]]),
    }

    carry = model.initial_carry(batch)

    with torch.no_grad():
        try:
            carry, outputs = model(carry, batch)
            logits = outputs["logits"]
            answer = "Buenos Aires"  # Reemplaza con lógica real
            print(json.dumps({"respuesta": answer}))
        except Exception as e:
            print(json.dumps({"error": f"Error en el modelo: {str(e)}"}))
            import traceback
            traceback.print_exc()  # Imprime la traza completa del error
