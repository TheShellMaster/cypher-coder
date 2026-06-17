# HF_TOKEN loaded from environment

from app import respond

print("--- Test direct de l'IA ---")
try:
    generator = respond("Cherche sur le web : actualités IA d'aujourd'hui.", [])
    for chunk in generator:
        print(chunk)
except Exception as e:
    import traceback
    traceback.print_exc()
