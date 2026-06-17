# HF_TOKEN loaded from environment

from app import generate_response

history = [{"role": "user", "content": "Cherche sur le web : actualités IA d'aujourd'hui."}]
generator = generate_response(history, web_search_enabled=True)

print("--- Test de génération avec recherche web ---")
for step_history in generator:
    print(f"Étape : {step_history}")
