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
Tu dois toujours te présenter en tant que tel si on te demande qui tu es.

[INSTRUCTION MAJEURE] : Tu as désormais accès à internet grâce à l'outil `search_web`. Si un utilisateur te pose une question nécessitant des informations récentes, de la documentation technique à jour, ou des faits dont tu n'es pas sûr, TU DOIS IMPÉRATIVEMENT utiliser l'outil `search_web` avant de répondre. Ne devine jamais une nouveauté technologique si tu peux chercher sur internet."""

# Définition des "Outils" (Function Calling)
tools = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Fait une recherche sur internet pour trouver des informations récentes, des articles de presse, ou de la documentation technique.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "La requête de recherche (en français ou en anglais)."
                    }
                },
                "required": ["query"]
            }
        }
    }
]

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
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    for val in history:
        if val[0]:
            messages.append({"role": "user", "content": val[0]})
        if val[1]:
            messages.append({"role": "assistant", "content": val[1]})
            
    messages.append({"role": "user", "content": message})
    
    # 1. On donne la question au modèle et on attend de voir s'il décide d'utiliser un outil
    response = client.chat_completion(
        messages,
        max_tokens=2048,
        tools=tools,
        stream=False, # Pas de stream tout de suite pour bien vérifier les outils
    )
    
    first_response = response.choices[0].message

    # 2. Si le modèle a décidé d'utiliser un outil (ex: search_web)
    if first_response.tool_calls:
        # Petit message d'attente pour l'utilisateur
        yield "🔍 *Cypher AI fouille le web pour répondre de manière précise...*"
        
        # On ajoute sa décision à l'historique
        messages.append(first_response)
        
        # Exécution des outils demandés
        for tool_call in first_response.tool_calls:
            if tool_call.function.name == "search_web":
                args = json.loads(tool_call.function.arguments)
                search_query = args["query"]
                search_result = search_web(search_query)
                
                # On ajoute le résultat de la recherche à la conversation
                messages.append({
                    "role": "tool",
                    "name": "search_web",
                    "content": search_result,
                    "tool_call_id": tool_call.id
                })
        
        # 3. On redemande au modèle de formuler sa réponse finale en lisant les résultats du web (avec stream cette fois)
        final_stream = client.chat_completion(
            messages,
            max_tokens=2048,
            stream=True,
        )
        
        response_text = ""
        for chunk in final_stream:
            if chunk.choices and len(chunk.choices) > 0:
                token = chunk.choices[0].delta.content
                if token:
                    response_text += token
                    yield response_text
                
    else:
        # S'il n'a pas besoin du web, il répond directement
        if first_response.content:
            yield first_response.content

demo = gr.ChatInterface(
    respond,
    title="Cypher AI 💻 (Connecté au Web 🌐)",
    description="L'expert en programmation, développé par **DJAKOUA KWANKAM** (Institut Universitaire de Douala). *A désormais accès à internet pour les recherches.*",
    examples=[
        "Qui es-tu et qui t'a créé ?",
        "Cherche sur le web quelles sont les nouveautés de React 19.",
        "Quelle est l'actualité tech d'aujourd'hui ?"
    ]
)

if __name__ == "__main__":
    demo.launch()
