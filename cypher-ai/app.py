import gradio as gr
from huggingface_hub import InferenceClient
import os

# Chargement du token HF
token = os.environ.get("HF_TOKEN")
if not token:
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("HF_TOKEN"):
                        parts = line.split("=", 1)
                        if len(parts) > 1:
                            token = parts[1].strip().strip('"').strip("'")
                            break
    except Exception:
        pass

client = InferenceClient(token=token)

def respond(message, history):
    messages = [{"role": "system", "content": "Tu es Cypher AI, une intelligence artificielle spécialisée dans la programmation, développée par DJAKOUA KWANKAM."}]
    
    # Prise en charge des différents formats d'historique de Gradio
    for h in history:
        if isinstance(h, dict):
            messages.append({"role": h["role"], "content": h["content"]})
        elif isinstance(h, (list, tuple)) and len(h) == 2:
            if h[0]:
                messages.append({"role": "user", "content": h[0]})
            if h[1]:
                messages.append({"role": "assistant", "content": h[1]})
                
    messages.append({"role": "user", "content": message})
    
    response = ""
    try:
        for chunk in client.chat_completion(
            model="Qwen/Qwen2.5-Coder-7B-Instruct",
            messages=messages,
            max_tokens=2048,
            stream=True
        ):
            if chunk.choices and len(chunk.choices) > 0:
                token_val = chunk.choices[0].delta.content
                if token_val:
                    response += token_val
                    yield response
    except Exception as e:
        yield f"Erreur : {str(e)}"

# Lancement de l'interface par défaut de Gradio
demo = gr.ChatInterface(respond)

if __name__ == "__main__":
    demo.launch()
