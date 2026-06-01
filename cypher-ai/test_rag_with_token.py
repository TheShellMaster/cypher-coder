import os
import json
from huggingface_hub import InferenceClient
from duckduckgo_search import DDGS

# Load token from environment
token = os.environ.get("HF_TOKEN")
client = InferenceClient(token=token)

SYSTEM_PROMPT = "Tu es Cypher AI, assistant IA en monospace."

def search_web(query):
    try:
        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=3))
        formatted = []
        for r in results:
            formatted.append(f"Titre: {r['title']}\nRésumé: {r['body']}\nLien: {r['href']}")
        return "\n\n".join(formatted)
    except Exception as e:
        return f"Erreur de recherche : {str(e)}"

def test_run():
    message = "Cherche sur le web : actualités IA d'aujourd'hui."
    
    # Simulate pre-search (RAG)
    search_query = "actualités IA d'aujourd'hui"
    print("Performing search for:", search_query)
    search_results = search_web(search_query)
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + f"\n\n[CONTEXTE DU WEB]\n{search_results}\n[FIN DU CONTEXTE]"},
        {"role": "user", "content": message}
    ]
    
    # Call without tools parameter!
    response = client.chat_completion(
        model="Qwen/Qwen2.5-Coder-7B-Instruct",
        messages=messages,
        max_tokens=150
    )
    print("Response:")
    print(response.choices[0].message.content)

test_run()
