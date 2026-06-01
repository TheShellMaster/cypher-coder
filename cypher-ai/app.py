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

def add_user_message(message, history):
    if not message.strip():
        return "", history
    history.append({"role": "user", "content": message})
    return "", history

def generate_response(history, web_search_enabled, request=None):
    if not history or history[-1]["role"] != "user":
        yield history
        return
        
    username = "invité"
    if request:
        username = request.headers.get("x-hf-user-name") or "invité"
        
    user_message = history[-1]["content"]
    
    # 1. Analyse et déclenchement de la recherche web
    search_needed = web_search_enabled
    search_query = user_message
    msg_lower = user_message.lower()
    
    # Mots-clés déclencheurs de recherche
    keywords = [
        "cherche sur le web", "recherche sur le web", "cherche sur internet", "recherche sur internet",
        "actualités", "actualité", "dernière version", "nouveautés de", "nouveautés sur",
        "météo", "cours de l'action", "dernières nouvelles"
    ]
    
    if not search_needed:
        for kw in keywords:
            if kw in msg_lower:
                search_needed = True
                search_query = user_message
                for kw_to_remove in keywords:
                    search_query = search_query.replace(kw_to_remove, "")
                search_query = search_query.strip(" :?./\"'()")
                if not search_query or len(search_query) < 3:
                    search_query = user_message
                break
                
    if user_message.startswith("/web ") or user_message.startswith("/search "):
        search_needed = True
        parts = user_message.split(" ", 1)
        search_query = parts[1] if len(parts) > 1 else user_message

    context = ""
    if search_needed and search_query:
        # Ajout du message de statut de recherche
        history.append({"role": "assistant", "content": f"🔍 *Recherche en cours sur le web pour : '{search_query}'...*"})
        yield history
        
        search_res = search_web(search_query)
        context = f"\n\n[CONTEXTE DU WEB]\n{search_res}\n[FIN DU CONTEXTE]"
        
        history[-1]["content"] = f"🔍 *Résultats de recherche intégrés pour : '{search_query}'. Génération de la réponse...*"
        yield history

    # Reconstitution des messages pour l'API d'inférence
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    if search_needed and search_query:
        # Exclure le message de statut de recherche de l'historique envoyé à l'IA
        for h in history[:-1]:
            messages.append({"role": h["role"], "content": h["content"]})
    else:
        for h in history:
            messages.append({"role": h["role"], "content": h["content"]})
            
    if context:
        messages[0]["content"] += f"\nTu as accès aux résultats de recherche suivants pour répondre à l'utilisateur : {context}"

    # Remplacement/Ajout de l'assistant dans l'interface
    if search_needed and search_query:
        history[-1] = {"role": "assistant", "content": ""}
    else:
        history.append({"role": "assistant", "content": ""})
        
    yield history
    
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
                    history[-1]["content"] = response_text
                    yield history
                    
        # Enregistrement asynchrone des logs
        save_log_background(username, user_message, response_text)
        
    except Exception as e:
        error_msg = f"⚠️ Une erreur est survenue lors de la communication avec l'IA : {str(e)}"
        history[-1]["content"] = error_msg
        yield history

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
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap');

body {
    background: radial-gradient(circle at top right, #0F1323, #090A0F) !important;
    font-family: 'Outfit', sans-serif !important;
}

code, pre {
    font-family: 'JetBrains Mono', monospace !important;
}

.gradio-container {
    max-width: 1100px !important;
    margin: 0 auto !important;
    padding: 20px !important;
}

.cypher-header-container {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 24px;
    background: linear-gradient(135deg, #11131C 0%, #161926 100%);
    border: 1px solid #1E2235;
    border-radius: 16px;
    margin-bottom: 24px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.cypher-logo {
    width: 80px;
    height: 80px;
    border-radius: 14px;
    border: 2px solid #00FFAA;
    box-shadow: 0 0 20px rgba(0, 255, 170, 0.4);
    object-fit: cover;
}

.cypher-header-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.cypher-title {
    font-size: 32px;
    font-weight: 800;
    margin: 0;
    background: linear-gradient(90deg, #00FFAA, #00E5FF);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: 1.5px;
    line-height: 1.2;
}

.cypher-subtitle {
    font-size: 15px;
    color: #94A3B8;
    margin: 0;
}

.cypher-badge {
    font-size: 12px;
    color: #64748B;
    margin: 0;
}

.cypher-badge strong {
    color: #00E5FF;
}

#cypher-chatbot {
    background-color: #11131C !important;
    border: 1px solid #1E2235 !important;
    border-radius: 16px !important;
    box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5) !important;
    padding: 10px !important;
}

#cypher-chatbot .user, #cypher-chatbot .message.user {
    background: linear-gradient(135deg, #1B2035 0%, #161926 100%) !important;
    border: 1px solid #282E4F !important;
    color: #E2E8F0 !important;
    border-radius: 16px 16px 0px 16px !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

#cypher-chatbot .bot, #cypher-chatbot .message.assistant {
    background: linear-gradient(135deg, #0C1A24 0%, #0E1620 100%) !important;
    border: 1px solid #00E5FF33 !important;
    color: #E2E8F0 !important;
    border-radius: 16px 16px 16px 0px !important;
    box-shadow: 0 4px 15px rgba(0, 229, 255, 0.05) !important;
}

input[type="text"], textarea {
    border: 1px solid #1E2235 !important;
    background-color: #161926 !important;
    color: #F8FAFC !important;
    border-radius: 10px !important;
    transition: all 0.3s ease !important;
}

input[type="text"]:focus, textarea:focus {
    border-color: #00FFAA !important;
    box-shadow: 0 0 10px rgba(0, 255, 170, 0.2) !important;
}

.gr-button-primary {
    background: linear-gradient(90deg, #00FFAA, #00E5FF) !important;
    color: #090A0F !important;
    font-weight: 700 !important;
    border: none !important;
    box-shadow: 0 4px 15px rgba(0, 255, 170, 0.2) !important;
    transition: all 0.3s ease !important;
}

.gr-button-primary:hover {
    box-shadow: 0 0 20px rgba(0, 255, 170, 0.5) !important;
    transform: translateY(-1px);
}

.web-search-row {
    background-color: #11131C;
    border: 1px solid #1E2235;
    border-radius: 12px;
    padding: 10px 15px;
    margin-top: 10px;
}

footer {
    display: none !important;
}
"""

logo_abs_path = os.path.abspath("logo.png")

with gr.Blocks(theme=theme, css=css) as demo:
    # Header personnalisé avec logo et descriptif
    gr.HTML(f"""
    <div class="cypher-header-container">
        <img src="file/{logo_abs_path}" class="cypher-logo" alt="Cypher AI Logo">
        <div class="cypher-header-text">
            <h1 class="cypher-title">CYPHER AI</h1>
            <p class="cypher-subtitle">L'assistant de programmation d'élite & recherche web connectée 🌐</p>
            <p class="cypher-badge">Développé par <strong>DJAKOUA KWANKAM</strong> (IUT de Douala)</p>
        </div>
    </div>
    """)
    
    chatbot = gr.Chatbot(elem_id="cypher-chatbot")
    
    with gr.Row():
        msg = gr.Textbox(
            placeholder="Posez votre question technique ou demandez de l'aide sur du code...",
            scale=8,
            show_label=False,
            container=False
        )
        submit = gr.Button("Envoyer", scale=1, variant="primary")
        
    with gr.Row(elem_classes=["web-search-row"]):
        web_search = gr.Checkbox(
            label="🌐 Activer la recherche Web en direct (DuckDuckGo)",
            value=False,
            interactive=True
        )
        clear = gr.Button("Effacer la conversation", scale=1, size="sm")

    # Événements de soumission
    msg.submit(
        add_user_message,
        inputs=[msg, chatbot],
        outputs=[msg, chatbot],
        queue=False
    ).then(
        generate_response,
        inputs=[chatbot, web_search],
        outputs=[chatbot]
    )
    
    submit.click(
        add_user_message,
        inputs=[msg, chatbot],
        outputs=[msg, chatbot],
        queue=False
    ).then(
        generate_response,
        inputs=[chatbot, web_search],
        outputs=[chatbot]
    )
    
    # Effacer la conversation
    clear.click(lambda: [], None, chatbot)

if __name__ == "__main__":
    demo.queue().launch(
        allowed_paths=[os.path.abspath(".")]
    )
