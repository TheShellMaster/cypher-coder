import os
import gradio as gr
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from huggingface_hub import InferenceClient
from duckduckgo_search import DDGS
import json

token = os.environ.get("HF_TOKEN")
client = InferenceClient("Qwen/Qwen2.5-Coder-32B-Instruct", token=token)

app = FastAPI()

# -----------------------------------------------------
# Custom API Endpoint for the Cypher Coder CLI Client
# -----------------------------------------------------
def search_web(query):
    try:
        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=4))
        if not results:
            return "Aucun résultat trouvé sur le web."
        formatted = []
        for r in results:
            formatted.append(f"Titre: {r['title']}\nRésumé: {r['body']}\nLien: {r['href']}")
        return "\n\n".join(formatted)
    except Exception as e:
        return f"Erreur lors de la recherche: {str(e)}"

@app.get("/")
async def root():
    return RedirectResponse(url="/gradio")

@app.post("/api/chat")
async def chat(request: Request):
    try:
        body = await request.json()
        messages = body.get("messages", [])
        client_tools = body.get("tools", [])
        
        # Associer les outils locaux du client et l'outil de recherche web du serveur
        all_tools = list(client_tools)
        search_tool_def = {
            "type": "function",
            "function": {
                "name": "search_web",
                "description": "Recherche des informations actualisées ou de la documentation technique sur internet.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "La requête de recherche."
                        }
                    },
                    "required": ["query"]
                }
            }
        }
        all_tools.append(search_tool_def)
        
        # Boucle d'agent côté serveur pour exécuter search_web de manière transparente
        while True:
            response = client.chat_completion(
                messages=messages,
                tools=all_tools,
                max_tokens=2048,
                stream=False
            )
            choice = response.choices[0]
            
            # Vérifier si l'IA veut appeler des outils
            if choice.message.tool_calls:
                has_search_call = False
                for tc in choice.message.tool_calls:
                    if tc.function.name == "search_web":
                        has_search_call = True
                        break
                
                if has_search_call:
                    # Ajouter l'appel de l'outil du modèle à l'historique
                    messages.append({
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": tc.type,
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments
                                }
                            } for tc in choice.message.tool_calls
                        ]
                    })
                    
                    # Exécuter les appels search_web et ajouter les résultats
                    for tc in choice.message.tool_calls:
                        if tc.function.name == "search_web":
                            try:
                                args = json.loads(tc.function.arguments)
                                q = args.get("query", "")
                                search_res = search_web(q)
                                messages.append({
                                    "role": "tool",
                                    "name": "search_web",
                                    "tool_call_id": tc.id,
                                    "content": search_res
                                })
                            except Exception as parse_err:
                                messages.append({
                                    "role": "tool",
                                    "name": "search_web",
                                    "tool_call_id": tc.id,
                                    "content": f"Erreur de décodage des arguments: {str(parse_err)}"
                                })
                        else:
                            # Laisser les outils locaux vides pour ce tour
                            messages.append({
                                "role": "tool",
                                "name": tc.function.name,
                                "tool_call_id": tc.id,
                                "content": "En attente d'exécution locale..."
                            })
                    
                    # Relancer la génération avec le contexte de recherche mis à jour
                    continue
                else:
                    # Contient uniquement des outils locaux pour le client
                    message_data = {
                        "role": choice.message.role,
                        "content": choice.message.content,
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": tc.type,
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments
                                }
                            } for tc in choice.message.tool_calls
                        ]
                    }
                    return JSONResponse(content={"message": message_data})
            else:
                # Réponse textuelle finale sans outil
                message_data = {
                    "role": choice.message.role,
                    "content": choice.message.content
                }
                return JSONResponse(content={"message": message_data})
                
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

# -----------------------------------------------------
# Gradio Web Interface (Documentation & Chat)
# -----------------------------------------------------
SYSTEM_PROMPT = """Tu es Cypher Coder, un agent de programmation IA ultra-intelligent fonctionnant dans un terminal (CLI).
Tu as été conçu et développé par DJAKOUA KWANKAM, un brillant étudiant en informatique à l'Institut Universitaire de Douala (IUD).
Tu devez toujours te présenter comme tel.

Tu as accès à des outils locaux (comme lire des fichiers, écrire/modifier des fichiers, exécuter des commandes dans le terminal) qui s'exécutent sur la machine locale de l'utilisateur. Ces outils te sont fournis via le protocole CLI de Cypher Coder.
Pour les informations en temps réel ou la documentation externe, tu peux aussi utiliser la recherche web.
Sois toujours concis, professionnel et direct dans tes explications de code.
"""

web_tools = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Recherche des informations actualisées ou de la documentation technique sur internet.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "La requête de recherche."
                    }
                },
                "required": ["query"]
            }
        }
    }
]

def respond(message, history):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for val in history:
        if val[0]:
            messages.append({"role": "user", "content": val[0]})
        if val[1]:
            messages.append({"role": "assistant", "content": val[1]})
            
    messages.append({"role": "user", "content": message})
    
    try:
        response = client.chat_completion(
            messages,
            max_tokens=2048,
            tools=web_tools,
            stream=False
        )
        first_response = response.choices[0].message
        
        if first_response.tool_calls:
            yield "🔍 *Recherche web en cours...*"
            messages.append(first_response)
            for tool_call in first_response.tool_calls:
                if tool_call.function.name == "search_web":
                    args = json.loads(tool_call.function.arguments)
                    res = search_web(args["query"])
                    messages.append({
                        "role": "tool",
                        "name": "search_web",
                        "content": res
                    })
            
            final_stream = client.chat_completion(
                messages,
                max_tokens=2048,
                stream=True
            )
            response_text = ""
            for chunk in final_stream:
                token = chunk.choices[0].delta.content
                if token:
                    response_text += token
                    yield response_text
        else:
            if first_response.content:
                yield first_response.content
    except Exception as e:
        yield f"Erreur lors de la génération: {str(e)}"

theme = gr.themes.Soft(
    primary_hue="indigo",
    secondary_hue="cyan",
    neutral_hue="slate"
)

css = """
footer {visibility: hidden}
.title-container { text-align: center; margin-bottom: 20px; }
"""

with gr.Blocks(theme=theme, css=css) as demo:
    gr.HTML("""
    <div class="title-container">
        <h1>💻 Cypher Coder</h1>
        <p style='font-size: 1.2em; color: #6366F1;'>L'Agent de Programmation CLI Autonome</p>
        <p>Créé par <b>DJAKOUA KWANKAM</b> - Étudiant à l'Institut Universitaire de Douala (IUD)</p>
    </div>
    """)
    
    with gr.Tab("💬 Tester en Ligne"):
        gr.ChatInterface(
            respond,
            examples=[
                "Qui es-tu ?",
                "Écris-moi une fonction JavaScript pour trier un tableau.",
                "Quels outils CLI as-tu ?"
            ]
        )
        
    with gr.Tab("📖 Documentation CLI"):
        gr.Markdown("""
        # ⚙️ Cypher Coder CLI
        
        **Cypher Coder** est un agent conversationnel en ligne de commande (CLI) similaire à *Claude Code* ou *Gemini CLI*. Il est conçu pour s'exécuter directement dans votre terminal local et interagir avec votre système de fichiers de manière sécurisée.

        ---

        ## 🚀 Installation & Utilisation
        
        Pour exécuter Cypher Coder localement :
        ```bash
        # Naviguer dans le dossier du projet
        cd Documents/cypher-coder
        
        # Lancer l'agent CLI
        cypher
        ```

        ## 🛠️ Commandes Disponibles dans le CLI
        
        - `/help`   - Affiche l'aide
        - `/clear`  - Efface l'écran et réinitialise l'historique
        - `/exit`   - Ferme proprement l'application
        - `/settings` - Configure le jeton Hugging Face ou d'autres paramètres

        ## 🔌 Outils du Système (Capabilities)
        
        Lorsqu'il s'exécute localement via le terminal, **Cypher Coder** peut utiliser des outils pour vous aider :
        - 📁 **Lecture de fichiers** : Lire du code ou du texte sur votre machine.
        - 📝 **Écriture & Modification de fichiers** : Créer ou éditer des fichiers sources.
        - 🖥️ **Exécution de commandes** : Lancer des tests, installer des paquets, compiler, etc. (avec votre consentement explicite).
        - 🌐 **Recherche Web** : Rechercher sur internet en temps réel pour obtenir la documentation de dernière minute.
        """)

app = gr.mount_gradio_app(app, demo, path="/gradio")

if __name__ == "__main__":
    import uvicorn
    # Lancement d'Uvicorn uniquement en local
    uvicorn.run(app, host="0.0.0.0", port=7860)
