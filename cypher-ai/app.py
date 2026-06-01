import gradio as gr
from huggingface_hub import InferenceClient, HfApi, create_repo
from ddgs import DDGS
import os
import json
import uuid
import threading
from datetime import datetime
from io import BytesIO

# Configuration d'accès API Hugging Face (Inférence & Télémétrie)
token = os.environ.get("HF_TOKEN")
client = InferenceClient(token=token)
api = HfApi(token=token)

SYSTEM_PROMPT = """Tu es Cypher AI, une intelligence artificielle d'élite spécialisée dans la programmation, l'algorithmie et la conception de logiciels.
Tu as été développé par DJAKOUA KWANKAM, étudiant en informatique à l'Institut Universitaire de Technologie de Douala (IUT).
Tu es direct, précis, rigoureux et tu t'exprimes de façon fluide sans fioritures superflues.

[INSTRUCTIONS DE CONTEXTE INTERNET] : 
Quand l'utilisateur te pose une question nécessitant des recherches actualisées ou de la documentation technique récente, des extraits de résultats de recherche DuckDuckGo seront injectés automatiquement en début de message. Utilise ces données pour enrichir et structurer tes explications de manière claire et actualisée.
"""

def search_web(query):
    """Effectue une recherche via DuckDuckGo et renvoie les résultats structurés."""
    try:
        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=3))
        if not results:
            return "Aucun résultat trouvé sur le web."
        
        formatted = []
        for r in results:
            formatted.append(f"Titre: {r['title']}\nRésumé: {r['body']}\nLien: {r['href']}")
        return "\n\n".join(formatted)
    except Exception as e:
        return f"Erreur de recherche: {str(e)}"

def save_log(username: str, message: str, response: str):
    """Sauvegarde les logs d'interactions utilisateur dans le dataset privé d'entraînement."""
    if not token:
        return
    try:
        user = api.whoami()["name"]
        repo_id = f"{user}/cypher-coder-logs"
        try:
            create_repo(repo_id, token=token, repo_type="dataset", private=True, exist_ok=True)
        except Exception:
            pass
        
        log_entry = {
            "username": username,
            "timestamp": datetime.utcnow().isoformat(),
            "message": message,
            "response": response,
            "client": "cypher-ai-web"
        }
        
        file_path = f"logs/{username}/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.json"
        content_bytes = json.dumps(log_entry, ensure_ascii=False, indent=2).encode("utf-8")
        
        api.upload_file(
            path_or_fileobj=BytesIO(content_bytes),
            path_in_repo=file_path,
            repo_id=repo_id,
            repo_type="dataset",
            token=token
        )
    except Exception as e:
        print(f"Erreur lors de l'enregistrement de la télémétrie : {e}")

def save_log_background(username: str, message: str, response: str):
    """Lance la sauvegarde des logs dans un thread séparé pour ne pas bloquer l'interface utilisateur."""
    thread = threading.Thread(target=save_log, args=(username, message, response))
    thread.daemon = True
    thread.start()

def respond(message, history, request: gr.Request = None):
    username = "invité"
    if request:
        username = request.headers.get("x-hf-user-name") or "invité"

    # Format history for Inference API
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history:
        if isinstance(h, dict):
            messages.append({"role": h["role"], "content": h["content"]})
        elif isinstance(h, (list, tuple)) and len(h) == 2:
            if h[0]:
                messages.append({"role": "user", "content": h[0]})
            if h[1]:
                messages.append({"role": "assistant", "content": h[1]})

    # Analyse et déclenchement de la recherche web
    search_needed = False
    search_query = message
    msg_lower = message.lower()
    
    keywords = [
        "cherche sur le web", "recherche sur le web", "cherche sur internet", "recherche sur internet",
        "actualités", "actualité", "dernière version", "nouveautés de", "nouveautés sur",
        "météo", "cours de l'action", "dernières nouvelles"
    ]
    
    for kw in keywords:
        if kw in msg_lower:
            search_needed = True
            for kw_to_remove in keywords:
                search_query = search_query.replace(kw_to_remove, "")
            search_query = search_query.strip(" :?./\"'()")
            if not search_query or len(search_query) < 3:
                search_query = message
            break
            
    if message.startswith("/web ") or message.startswith("/search "):
        search_needed = True
        parts = message.split(" ", 1)
        search_query = parts[1] if len(parts) > 1 else message

    context = ""
    if search_needed and search_query:
        yield "🔍 *Recherche en cours sur le web...*"
        search_res = search_web(search_query)
        context = f"\n\n[CONTEXTE DU WEB]\n{search_res}\n[FIN DU CONTEXTE]"
        yield "🔍 *Résultats de recherche intégrés. Génération de la réponse...*"

    if context:
        messages[0]["content"] += f"\nTu as accès aux résultats de recherche suivants pour répondre à l'utilisateur : {context}"

    messages.append({"role": "user", "content": message})

    response_text = ""
    try:
        final_stream = client.chat_completion(
            model="Qwen/Qwen2.5-Coder-7B-Instruct",
            messages=messages,
            max_tokens=2048,
            stream=True
        )
        
        for chunk in final_stream:
            if chunk.choices and len(chunk.choices) > 0:
                token_val = chunk.choices[0].delta.content
                if token_val:
                    response_text += token_val
                    yield response_text
                    
        # Enregistrement asynchrone des logs
        save_log_background(username, message, response_text)
        
    except Exception as e:
        yield f"⚠️ Une erreur est survenue lors de la communication avec l'IA : {str(e)}"

# -----------------------------------------------------
# CONFIGURATION ET THÉMATISATION DE L'INTERFACE
# -----------------------------------------------------
theme = gr.themes.Default(
    primary_hue="cyan",
    secondary_hue="blue",
    neutral_hue="slate",
).set(
    body_background_fill="#090A0F",
    body_background_fill_dark="#090A0F",
    button_primary_background_fill="#00FFAA",
    button_primary_background_fill_hover="#00D48D",
    button_primary_text_color="#090A0F",
    block_background_fill="#11131C",
    block_border_color="#1E2235",
    border_color_primary="#1E2235",
    input_background_fill="#161926",
)

css = """
footer {
    display: none !important;
}
"""

with gr.Blocks(theme=theme, css=css) as demo:
    gr.ChatInterface(
        respond,
        title="CYPHER AI",
        description="L'assistant de programmation d'élite. Développé par DJAKOUA KWANKAM (IUT de Douala).",
    )

if __name__ == "__main__":
    demo.queue().launch(
        allowed_paths=[os.path.abspath(".")]
    )
