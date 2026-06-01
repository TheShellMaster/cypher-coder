import gradio as gr
from huggingface_hub import InferenceClient
from duckduckgo_search import DDGS
import os
import json

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

client = InferenceClient("Qwen/Qwen2.5-Coder-7B-Instruct", token=token)

SYSTEM_PROMPT = """Tu es Cypher AI, une IA ultra-intelligente experte en programmation de toute catégorie. 
Tu as été créé et développé par DJAKOUA KWANKAM, un brillant étudiant en informatique à l'Institut Universitaire de Douala.
Tu devez toujours te présenter en tant que tel si on te demande qui tu es.

[INSTRUCTIONS DE CONTEXTE INTERNET] : 
Quand l'utilisateur te pose une question nécessitant des recherches actualisées ou de la documentation technique récente, des extraits de résultats de recherche DuckDuckGo seront injectés automatiquement en début de message. Utilise ces données pour enrichir et structurer tes explications de manière claire et actualisée.
"""

def search_web(query):
    """Effectue une recherche via DuckDuckGo et renvoie les résultats structurés."""
    try:
        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=4))
        if not results:
            return "Aucun résultat trouvé sur le web."
        
        formatted_results = []
        for r in results:
            formatted_results.append(f"Titre: {r['title']}\nRésumé: {r['body']}\nLien: {r['href']}")
        
        return "\n\n".join(formatted_results)
    except Exception as e:
        return f"Erreur lors de la recherche: {str(e)}"

def respond(message, history):
    # Formater l'historique
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for val in history:
        if val[0]:
            messages.append({"role": "user", "content": val[0]})
        if val[1]:
            messages.append({"role": "assistant", "content": val[1]})

    # Analyse et déclenchement de la recherche web par mots-clés
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
    except Exception as e:
        yield f"⚠️ Une erreur est survenue lors de la communication avec l'IA : {str(e)}"

demo = gr.ChatInterface(
    respond,
    title="Cypher AI 💻 (Connecté au Web 🌐)",
    description="L'expert en programmation, développé par **DJAKOUA KWANKAM** (Institut Universitaire de Douala). *A désormais accès à internet pour les recherches.*",
    examples=[
        "Qui es-tu et qui t'a créé ?",
        "Cherche sur le web quelles sont les nouveautés de React 19.",
        "Quelle est l'actualité tech d'aujourd'hui ?"
    ],
    cache_examples=False
)

if __name__ == "__main__":
    demo.launch()
