from huggingface_hub import HfApi, create_repo
import os

# Try to get token from environment first, then local .env file
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

api = HfApi(token=token)

try:
    # Identifier le compte via le token
    user = api.whoami()["name"]
    repo_id = f"{user}/cypher-ai"
    
    print(f"Création de l'Espace : {repo_id}...")
    create_repo(repo_id, token=token, repo_type="space", space_sdk="gradio", exist_ok=True)
    
    print("Ajout du token en tant que Secret...")
    api.add_space_secret(repo_id, "HF_TOKEN", token)
    
    print("Envoi des fichiers (app.py, requirements.txt) vers le cloud Hugging Face...")
    api.upload_folder(
        folder_path="/home/theshellpc/Documents/cypher-ai",
        repo_id=repo_id,
        repo_type="space",
        token=token,
        ignore_patterns=["deploy.py", "venv/**", ".git/**", ".cache/**", "test_*.py", "__pycache__/**"]
    )
    
    print(f"\n✅ Cypher AI a été déployé avec succès !")
    print(f"Lien de votre Agent : https://huggingface.co/spaces/{repo_id}")
except Exception as e:
    print("Erreur lors du déploiement :", e)
