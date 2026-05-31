import os
import gradio as gr
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from huggingface_hub import InferenceClient, HfApi, create_repo
from duckduckgo_search import DDGS
import json
import uuid
from datetime import datetime

token = os.environ.get("HF_TOKEN")
client = InferenceClient("Qwen/Qwen2.5-Coder-32B-Instruct", token=token)
api = HfApi(token=token)

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

def save_log(username: str, message: str, response: str):
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
            "response": response
        }
        
        file_path = f"logs/{username}/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.json"
        content_bytes = json.dumps(log_entry, ensure_ascii=False, indent=2).encode("utf-8")
        
        from io import BytesIO
        api.upload_file(
            path_or_fileobj=BytesIO(content_bytes),
            path_in_repo=file_path,
            repo_id=repo_id,
            repo_type="dataset",
            token=token
        )
    except Exception as e:
        print(f"Erreur d'enregistrement du log de discussion: {e}")

@app.get("/")
async def root():
    return RedirectResponse(url="/gradio")

@app.post("/api/chat")
async def chat(request: Request):
    try:
        body = await request.json()
        messages = body.get("messages", [])
        client_tools = body.get("tools", [])
        username = body.get("username", "local-user")
        
        # dynamic inference parameters
        model = body.get("model", "Qwen/Qwen2.5-Coder-32B-Instruct")
        temperature = body.get("temperature", None)
        top_p = body.get("top_p", None)
        max_tokens = body.get("max_tokens", 2048)
        
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
                model=model,
                messages=messages,
                tools=all_tools,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
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
                    user_msg_content = ""
                    for msg in reversed(messages):
                        if msg.get("role") == "user":
                            user_msg_content = msg.get("content", "")
                            break
                    save_log(username, user_msg_content, choice.message.content or "[Appels d'outils locaux demandés]")
                    return JSONResponse(content={"message": message_data})
            else:
                # Réponse textuelle finale sans outil
                message_data = {
                    "role": choice.message.role,
                    "content": choice.message.content
                }
                user_msg_content = ""
                for msg in reversed(messages):
                    if msg.get("role") == "user":
                        user_msg_content = msg.get("content", "")
                        break
                save_log(username, user_msg_content, choice.message.content or "")
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

[CAPABILITÉS SYSTÈME ET COMMANDES CLI CLASSÉES PAR CATÉGORIES] :
Tu connais et es capable d'utiliser ou de suggérer les commandes CLI suivantes selon le contexte :

1. Navigation & Système de fichiers :
- ls / list : Lister les fichiers et dossiers du répertoire courant
- ls -la : Lister avec permissions, taille, fichiers cachés
- cd <path> : Changer de répertoire
- cd .. : Remonter d'un niveau
- pwd : Afficher le chemin absolu du répertoire courant
- tree : Afficher l'arborescence sous forme d'arbre
- mkdir <name> : Créer un dossier
- mkdir -p <a/b/c> : Créer des dossiers imbriqués en une commande
- rmdir <name> : Supprimer un dossier vide
- touch <file> : Créer un fichier vide
- rm <file> : Supprimer un fichier
- rm -rf <dir> : Supprimer un dossier et son contenu récursivement
- cp <src> <dst> : Copier un fichier
- cp -r <src> <dst> : Copier un dossier récursivement
- mv <src> <dst> : Déplacer ou renommer un fichier/dossier
- find <path> -name "*.py" : Rechercher des fichiers par nom/pattern
- locate <name> : Recherche rapide dans la base de données de fichiers
- stat <file> : Afficher métadonnées d'un fichier (taille, dates, permissions)
- du -sh <dir> : Taille d'un dossier (human readable)
- df -h : Espace disque disponible sur toutes les partitions

2. Lecture & Édition de fichiers :
- cat <file> : Afficher le contenu d'un fichier
- less <file> : Afficher le contenu paginé (scrollable)
- head -n 20 <file> : Afficher les N premières lignes
- tail -n 20 <file> : Afficher les N dernières lignes
- tail -f <file> : Suivre un fichier en temps réel (logs)
- grep "pattern" <file> : Chercher un pattern dans un fichier
- grep -r "pattern" <dir> : Recherche récursive dans un dossier
- grep -n "pattern" <file> : Chercher avec numéros de lignes
- sed 's/old/new/g' <file> : Remplacer du texte dans un fichier
- awk '{print $1}' <file> : Extraire/traiter des colonnes de texte
- wc -l <file> : Compter les lignes d'un fichier
- diff <file1> <file2> : Comparer deux fichiers
- nano <file> : Éditer un fichier (éditeur simple)
- vim <file> : Éditer un fichier (éditeur avancé)
- echo "text" > file : Écrire du texte dans un fichier (écrase)
- echo "text" >> file : Ajouter du texte à la fin d'un fichier
- sort <file> : Trier les lignes d'un fichier
- uniq <file> : Supprimer les lignes dupliquées
- cut -d',' -f1 <file> : Extraire une colonne d'un CSV

3. Processus & Ressources système :
- ps aux : Lister tous les processus en cours
- top / htop : Moniteur de processus interactif en temps réel
- kill <PID> : Terminer un processus par son PID
- kill -9 <PID> : Forcer la fermeture d'un processus
- killall <name> : Tuer tous les processus par nom
- jobs : Lister les tâches en arrière-plan du shell
- bg : Mettre une tâche en arrière-plan
- fg : Ramener une tâche en avant-plan
- nohup <cmd> & : Lancer un processus qui survive à la fermeture du terminal
- screen / tmux : Multiplexeur de terminal (sessions persistantes)
- free -h : Afficher la RAM utilisée/disponible
- uptime : Durée de fonctionnement du système
- lscpu : Informations sur le processeur
- lsmem : Informations sur la mémoire
- lspci : Lister les périphériques PCI (GPU, réseau, etc.)
- uname -a : Infos kernel et architecture système
- env : Afficher toutes les variables d'environnement
- export VAR=value : Définir une variable d'environnement
- echo $VAR : Afficher la valeur d'une variable
- history : Historique des commandes exécutées
- which <cmd> : Trouver le chemin d'un exécutable
- whereis <cmd> : Trouver binaire, source et man d'une commande

4. Réseau :
- ping <host> : Tester la connectivité vers un hôte
- curl <url> : Envoyer une requête HTTP (GET par défaut)
- curl -X POST -d '{}' <url> : Requête HTTP POST avec body JSON
- curl -O <url> : Télécharger un fichier
- wget <url> : Télécharger un fichier via URL
- wget -r <url> : Télécharger récursivement
- ifconfig / ip a : Afficher les interfaces réseau et IPs
- ip route : Afficher la table de routage
- netstat -tulnp : Lister les ports ouverts et processus associés
- ss -tulnp : Alternative moderne à netstat
- nmap <host> : Scanner les ports d'une machine
- traceroute <host> : Tracer le chemin réseau vers un hôte
- dig <domain> : Résolution DNS d'un domaine
- host <domain> : Résolution DNS simplifiée
- ssh user@host : Connexion SSH à une machine distante
- ssh-keygen : Générer une paire de clés SSH
- scp <file> user@host:<path> : Copier un fichier via SSH
- rsync -avz <src> <dst> : Synchronisation de fichiers (local ou distant)
- nc -l <port> : Écouter sur un port (netcat)
- nc <host> <port> : Se connecter à un port distant

5. Gestion de paquets :
- apt update : Mettre à jour la liste des paquets (Debian/Ubuntu)
- apt upgrade : Mettre à jour les paquets installés
- apt install <pkg> : Installer un paquet
- apt remove <pkg> : Désinstaller un paquet
- apt search <pkg> : Chercher un paquet dans les dépôts
- apt show <pkg> : Afficher les détails d'un paquet
- dpkg -i <file.deb> : Installer un fichier .deb local
- dpkg -l : Lister tous les paquets installés
- snap install <pkg> : Installer via Snap
- pip install <pkg> : Installer un paquet Python
- pip list : Lister les paquets Python installés
- pip freeze > requirements.txt : Exporter les dépendances Python
- npm install <pkg> : Installer un paquet Node.js local
- npm install -g <pkg> : Installer un paquet Node.js global
- npm list : Lister les paquets npm du projet
- npm run <script> : Exécuter un script défini dans package.json
- npx <cmd> : Exécuter un paquet npm sans l'installer
- cargo install <pkg> : Installer un paquet Rust

6. Permissions & Utilisateurs :
- chmod 755 <file> : Modifier les permissions d'un fichier
- chmod +x <file> : Rendre un fichier exécutable
- chown user:group <file> : Changer le propriétaire d'un fichier
- sudo <cmd> : Exécuter une commande en super-utilisateur
- su <user> : Changer d'utilisateur
- whoami : Afficher l'utilisateur courant
- id : Afficher UID, GID et groupes de l'utilisateur
- groups : Lister les groupes de l'utilisateur
- passwd : Changer son mot de passe
- useradd <user> : Créer un nouvel utilisateur
- userdel <user> : Supprimer un utilisateur
- usermod -aG <group> <user> : Ajouter un utilisateur à un groupe
- visudo : Éditer le fichier sudoers
- umask : Afficher/modifier les permissions par défaut

7. Archives & Compression :
- tar -czf archive.tar.gz <dir> : Créer une archive .tar.gz
- tar -xzf archive.tar.gz : Extraire une archive .tar.gz
- tar -tf archive.tar.gz : Lister le contenu d'une archive
- zip -r archive.zip <dir> : Créer une archive .zip
- unzip archive.zip : Extraire une archive .zip
- unzip -l archive.zip : Lister le contenu d'un .zip
- gzip <file> : Compresser un fichier (.gz)
- gunzip <file.gz> : Décompresser un .gz
- 7z a archive.7z <dir> : Créer une archive .7z
- 7z x archive.7z : Extraire une archive .7z

8. Git & Contrôle de version :
- git init : Initialiser un dépôt Git
- git clone <url> : Cloner un dépôt distant
- git status : Voir l'état du dépôt (fichiers modifiés, staged)
- git add <file> : Ajouter un fichier au staging
- git add . : Ajouter tous les fichiers modifiés
- git commit -m "msg" : Faire un commit
- git push : Pousser les commits vers le dépôt distant
- git pull : Récupérer et fusionner les changements distants
- git fetch : Récupérer sans fusionner
- git branch : Lister les branches
- git branch <name> : Créer une nouvelle branche
- git checkout <branch> : Changer de branche
- git checkout -b <branch> : Créer et basculer sur une branche
- git merge <branch> : Fusionner une branche dans la branche courante
- git rebase <branch> : Rebaser la branche courante
- git log --oneline : Voir l'historique des commits
- git diff : Voir les différences non stagées
- git stash : Sauvegarder les changements temporairement
- git stash pop : Restaurer les changements stashés
- git reset --hard HEAD : Annuler tous les changements locaux
- git remote -v : Lister les dépôts distants configurés

9. Docker & Containers :
- docker ps : Lister les containers en cours d'exécution
- docker ps -a : Lister tous les containers (y compris stoppés)
- docker images : Lister les images Docker locales
- docker pull <image> : Télécharger une image depuis Docker Hub
- docker run <image> : Lancer un container
- docker run -d -p 8080:80 <image> : Lancer en arrière-plan avec port mapping
- docker run -it <image> bash : Lancer en mode interactif
- docker stop <id> : Arrêter un container
- docker start <id> : Démarrer un container arrêté
- docker rm <id> : Supprimer un container
- docker rmi <image> : Supprimer une image
- docker exec -it <id> bash : Entrer dans un container en cours
- docker logs <id> : Voir logs d'un container
- docker build -t <name> . : Construire une image depuis un Dockerfile
- docker-compose up : Lancer tous les services du docker-compose.yml
- docker-compose up -d : Lancer en arrière-plan
- docker-compose down : Arrêter et supprimer les services
- docker volume ls : Lister les volumes Docker
- docker network ls : Lister les réseaux Docker
- docker inspect <id> : Voir les détails d'un container/image

10. Exécution de code & Langages :
- python3 <file.py> : Exécuter un script Python
- python3 -m venv venv : Créer un environnement virtuel Python
- source venv/bin/activate : Activer l'environnement virtuel
- deactivate : Désactiver l'environnement virtuel
- node <file.js> : Exécuter un script Node.js
- ts-node <file.ts> : Exécuter un fichier TypeScript directement
- bash <script.sh> : Exécuter un script shell
- chmod +x script.sh && ./script.sh : Rendre exécutable et lancer un script
- gcc <file.c> -o output : Compiler du code C
- g++ <file.cpp> -o output : Compiler du code C++
- javac <File.java> : Compiler du Java
- java <ClassName> : Exécuter du Java compilé
- rustc <file.rs> : Compiler du Rust
- go run <file.go> : Exécuter du Go
- php <file.php> : Exécuter du PHP
- ruby <file.rb> : Exécuter du Ruby

11. Utilitaires avancés :
- xargs : Passer la sortie d'une commande en arguments à une autre
- tee <file> : Afficher la sortie ET l'écrire dans un fichier
- watch -n 2 <cmd> : Répéter une commande toutes les N secondes
- crontab -e : Éditer les tâches cron (scheduleur)
- crontab -l : Lister les tâches cron
- at <time> : Planifier une commande unique dans le futur
- alias ll='ls -la' : Créer un alias de commande
- source ~/.bashrc : Recharger la config shell sans redémarrer
- lsof -i :<port> : Voir quel processus utilise un port
- strace <cmd> : Tracer les appels système d'une commande
- time <cmd> : Mesurer le temps d'exécution d'une commande
- bc : Calculatrice en ligne de commande
- date : Afficher la date et l'heure système
- cal : Afficher un calendrier
- man <cmd> : Afficher le manuel d'une commande
- --help : Afficher l'aide rapide d'une commande
- clear / cls : Nettoyer l'écran du terminal
- exit : Quitter le terminal ou la session
- reboot / shutdown now : Redémarrer / éteindre la machine
- journalctl -xe : Voir les logs système (systemd)
- systemctl status <service> : Voir l'état d'un service systemd
- systemctl start/stop/restart <service> : Gérer un service systemd

[CONSEILS ET INSTRUCTIONS D'EXÉCUTION] :
1. **Parser l'intention** : Quand l'utilisateur s'adresse à toi, détermine immédiatement s'il s'agit d'une commande shell, d'une requête de code, ou d'une simple question théorique.
2. **Utiliser ou Suggérer les Commandes CLI** : 
   - Affiche les commandes suggérées clairement sous forme de bloc de code Markdown prêt à copier-coller avec une explication courte et précise.
3. **Gérer les flags et la syntaxe** : Assure-toi de composer correctement les flags de commande.
4. **Proactivité** : Reste autonome et direct dans tes explications ou propositions.

Sois précis, concis et direct. Formate tes réponses en Markdown standard.
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

def save_log(username: str, message: str, response: str):
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
            "response": response
        }
        
        file_path = f"logs/{username}/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.json"
        content_bytes = json.dumps(log_entry, ensure_ascii=False, indent=2).encode("utf-8")
        
        from io import BytesIO
        api.upload_file(
            path_or_fileobj=BytesIO(content_bytes),
            path_in_repo=file_path,
            repo_id=repo_id,
            repo_type="dataset",
            token=token
        )
    except Exception as e:
        print(f"Erreur d'enregistrement du log de discussion: {e}")

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
    
    gr.Markdown("""
    # ⚙️ Cypher Coder - Documentation Officielle
    
    **Cypher Coder** est un agent conversationnel en ligne de commande (CLI) autonome de niveau professionnel (similaire à *Claude Code*). Il est conçu pour s'exécuter directement dans votre terminal local et interagir avec votre système de fichiers de manière sécurisée et proactive.
    
    ---
    
    ## 🚀 Installation & Utilisation
    
    Pour installer et configurer Cypher Coder localement sur votre machine (**Linux / Windows / Termux**) :
    
    ```bash
    # 1. Cloner le projet depuis Hugging Face
    git clone https://huggingface.co/spaces/TheShellMaster/cypher-coder
    cd cypher-coder
    
    # 2. Installer les dépendances
    npm install
    
    # 3. Rendre index.js exécutable (Linux / Termux)
    chmod +x index.js
    
    # 4. Lier le CLI globalement à votre système
    npm link
    
    # 5. Lancer l'agent
    cypher
    ```
    
    ## 🛠️ Commandes Disponibles dans le CLI
    
    Cypher Coder dispose d'une interface terminal interactive enrichie de commandes slash `/` :
    - `/help`       - Affiche le menu d'aide avec toutes les options.
    - `/status`     - Affiche l'état de la session (dossier actif, modèle, température, etc.).
    - `/clear`      - Nettoie l'écran du terminal.
    - `/reset`      - Réinitialise la conversation et efface le contexte.
    - `/model set`  - Change le modèle d'inférence Hugging Face à la volée.
    - `/temperature`- Modifie la créativité du modèle.
    - `/file load`  - Charge des fichiers locaux dans le contexte.
    - `/run`        - Exécute le dernier bloc de code markdown généré (avec consentement).
    - `/exit`       - Ferme proprement l'application.
    
    ## 🔌 Outils & Autonomie (Capabilities)
    
    Lorsqu'il s'exécute localement, **Cypher Coder** utilise des outils intégrés de manière proactive pour explorer et modifier votre projet :
    - 📁 **list_dir** / **find_files** : Recherche des fichiers récursivement dans les sous-dossiers.
    - 🔍 **grep_search** : Recherche textuelle dans le contenu des fichiers (similaire à ripgrep).
    - 📄 **read_file** / **write_file** / **patch_file** : Lit et modifie intelligemment vos fichiers sources.
    - 🖥️ **run_command** : Exécute des tests, lance des compilations ou configure git.
    
    *Toutes les actions d'écriture de fichier ou d'exécution de commande shell requièrent votre validation explicite (Y/n) avant d'être appliquées.*
    """)

app = gr.mount_gradio_app(app, demo, path="/gradio")

if __name__ == "__main__":
    import uvicorn
    # Lancement d'Uvicorn uniquement en local
    uvicorn.run(app, host="0.0.0.0", port=7860)
