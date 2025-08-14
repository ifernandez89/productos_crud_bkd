import sys
import json
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from hrm_act_v1 import HierarchicalReasoningModel_ACTV1 as HRMModel
from transformers import AutoTokenizer

# =========================
# Configuración HRM
# =========================
config_dict = {
    "batch_size": 1,
    "seq_len": 32,  # reducido para ejemplo
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

# =========================
# Cargar modelo HRM y tokenizer
# =========================
hrm_model = HRMModel(config_dict=config_dict)
hrm_model.eval()
tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")

# =========================
# Mini dataset de ejemplo
# =========================
mini_dataset = [
    ("cual es la capital de Argentina", "La capital de Argentina es Buenos Aires."),
    ("cual es la capital de Francia", "La capital de Francia es París."),
    ("hola! como estas?", "Hola! Estoy bien, gracias."),
    ("explica como funciona una red neuronal", 
     "Una red neuronal aprende patrones ajustando pesos entre nodos y capas."),
]

class QADataset(Dataset):
    def __init__(self, data, tokenizer, seq_len):
        self.data = data
        self.tokenizer = tokenizer
        self.seq_len = seq_len

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        question, answer = self.data[idx]
        q_enc = tokenizer(question, padding="max_length", truncation=True,
                          max_length=self.seq_len, return_tensors="pt")["input_ids"].squeeze(0)
        a_enc = tokenizer(answer, padding="max_length", truncation=True,
                          max_length=self.seq_len, return_tensors="pt")["input_ids"].squeeze(0)
        return q_enc, a_enc

dataset = QADataset(mini_dataset, tokenizer, config_dict["seq_len"])
dataloader = DataLoader(dataset, batch_size=1, shuffle=True)

# =========================
# Decodificador RNN con proyección HRM -> hidden
# =========================
class RNNDecoder(nn.Module):
    def __init__(self, input_dim, hidden_dim, vocab_size):
        super().__init__()
        self.rnn = nn.GRU(input_dim, hidden_dim, batch_first=True)
        self.output = nn.Linear(hidden_dim, vocab_size)

    def forward(self, x):
        out, _ = self.rnn(x)
        logits = self.output(out)
        return logits

hidden_dim = 256
decoder_model = RNNDecoder(input_dim=config_dict["hidden_size"], hidden_dim=hidden_dim,
                           vocab_size=config_dict["vocab_size"])
decoder_model.eval()

# Capa lineal para proyectar HRM logits -> hidden_size
linear_proj = nn.Linear(config_dict["vocab_size"], config_dict["hidden_size"])
linear_proj.eval()

# =========================
# Función de inferencia
# =========================
def infer(question):
    inputs = tokenizer(question, padding="max_length",
                       max_length=config_dict["seq_len"], truncation=True, return_tensors="pt")
    input_ids = inputs["input_ids"]
    batch = {
        "inputs": input_ids,
        "puzzle_identifiers": torch.tensor([[]]),
    }
    carry = hrm_model.initial_carry(batch)
    
    with torch.no_grad():
        carry, hrm_outputs = hrm_model(carry, batch)
        hrm_logits = hrm_outputs.get("logits")
        hrm_probs = torch.softmax(hrm_logits, dim=-1).float()
        hrm_embedding = linear_proj(hrm_probs)
        decoder_logits = decoder_model(hrm_embedding)
        pred_ids = torch.argmax(decoder_logits, dim=-1)[0].tolist()
        text = tokenizer.decode(pred_ids, skip_special_tokens=True)
        return text

# =========================
# Función principal
# =========================
def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No se pasó ninguna pregunta"}))
        return
    question = sys.argv[1]
    respuesta = infer(question)
    print(json.dumps({
        "pregunta": question,
        "respuesta_natural": respuesta
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
