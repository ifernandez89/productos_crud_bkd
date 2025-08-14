import sys
import json
from hrm import HRM  # Asegúrate de que la librería esté importable

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No question provided"}))
        sys.exit(1)

    question = sys.argv[1]
    
    # Inicializar el modelo HRM
    model = HRM()  
    result = model.answer(question)  # Según API del repo, ajustar si cambia

    print(json.dumps({"respuesta": result}, ensure_ascii=False))

if __name__ == "__main__":
    main()
