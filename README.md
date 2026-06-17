# 💻 Cypher Coder - Agent IA de Programmation CLI (v2.0.0)

**Cypher Coder** est un agent conversationnel en ligne de commande (CLI) autonome, capable de concevoir, lire, modifier du code localement et d'exécuter des commandes système directement dans votre terminal sous votre supervision.

Ce projet a été conçu et développé par **DJAKOUA KWANKAM**, étudiant en informatique à l'**Institut Universitaire de Technologie de Douala (IUT)**.

---

## 🏗️ Structure Globale du Projet & Configuration

L'environnement de travail de Cypher Coder est divisé en plusieurs répertoires clés, répartis entre le projet local, la configuration de l'utilisateur, le serveur cloud et le stockage persistant.

### 1. Structure de l'Espace de Travail (Workspace Local)
```
cypher-coder/
├── index.js                  # Code source principal du client CLI local (saisie, TUI, exécution d'outils)
├── package.json              # Déclaration des dépendances Node.js et du point d'entrée global "cypher"
├── package-lock.json         # Fichier de verrouillage des dépendances
├── serveur/                  # Code source du serveur FastAPI déployé sur Hugging Face Spaces
│   ├── app.py                # Point d'entrée de l'API (FastAPI) avec boucle de repli automatique
│   ├── Dockerfile            # Recette Docker pour le déploiement sur Hugging Face Spaces
│   ├── requirements.txt      # Dépendances Python nécessaires (FastAPI, Uvicorn, Gradio, etc.)
│   ├── index.html            # Documentation d'accueil HTML du serveur
│   ├── .dockerignore         # Fichiers ignorés par Docker lors du build
│   └── README.md             # Documentation spécifique au déploiement Hugging Face
└── .cypher/
    └── docs/                 # Dossier contenant la documentation de conception et de suivi
        ├── implementation_plan.md # Plan de conception de la v2 (en français)
        └── walkthrough.md         # Rapport de validation finale des tests (en français)
```

### 2. Répertoires de Configuration Globale (Dossier Utilisateur)
Ces dossiers se situent dans le répertoire personnel de l'utilisateur (`~/.cypher/` sous Linux/macOS ou `C:\Users\<Nom>\.cypher\` sous Windows) :
*   `~/.cypher/config.json` : Fichier JSON stockant les paramètres persistants de l'utilisateur (modèle par défaut, permissions, mode YOLO).
*   `~/.cypher/commands/` : Dossier contenant les définitions des **commandes slash personnalisées globales** (fichiers `.json`).
*   `~/.cypher/agents/` : Dossier contenant les configurations des **sous-agents spécialisés globaux** (fichiers `.json`).

### 3. Répertoires de Configuration Locale (Dossier du Projet Actuel)
Ces répertoires se trouvent directement dans le dossier dans lequel vous lancez le CLI :
*   `./.cypher/commands/` : Dossier contenant les **commandes slash personnalisées locales** (spécifiques au projet actuel).
*   `./.cypher/agents/` : Dossier contenant les **sous-agents locaux** (spécifiques au projet actuel).

---

## ⚙️ Architecture & Fonctionnement de la Boucle d'Agent

L'architecture repose sur un modèle hybride Client-Serveur pour maximiser les performances tout en s'exécutant sur des machines locales légères :

```
+-----------------------------------------------------------------+
|                        MACHINE LOCALE                           |
|                                                                 |
|   +-------------+      Prompt      +------------------------+   |
|   |             | +--------------> |                        |   |
|   |  Terminal   |                  |    Client CLI Node     |   |
|   |  Utilisateur| <--------------+ | (index.js / Raw Mode)  |   |
|   |             |      Réponse     |                        |   |
|   +-------------+                  +------------------------+   |
|                                      ^                  |       |
|                                      | Outils           | API   |
|                                      | Locaux           | Chat  |
|                                      v                  v       |
|                             +-----------------------------+     |
|                             |    SYSTÈME DE FICHIERS /    |     |
|                             |      TERMINAL DE L'UTIL.    |     |
|                             +-----------------------------+     |
+--------------------------------------+--------------------------+
                                       |            ^
                                       | curl       | JSON
                                       | HTTP POST  | Response
                                       v            |
+--------------------------------------+--------------------------+
|                  CLOUD HUGGING FACE (BACKEND DOCKER)            |
|                                                                 |
|   +-----------------------+   Inference  +------------------+   |
|   |                       | +----------> | Qwen-2.5-72B     |   |
|   |   FastAPI Gateway     |              | (Modèle Principal|   |
|   |                       | <-- Fallback | Llama-3.3-70B)   |   |
|   +-----------------------+              +------------------+   |
|               |                                                 |
|               | Outil search_web                                |
|               v                                                 |
|   +-----------------------+                                     |
|   |   DuckDuckGo Search   |                                     |
|   +-----------------------+                                     |
+-----------------------------------------------------------------+
```

### 1. Le Client CLI (Local Node.js)
Il intercepte les entrées clavier brutes (`Raw Mode`), gère l'historique et l'autocomplétion dynamique des commandes slash, et exécute des outils système après validation de l'utilisateur :
*   `read_file` : Lit le contenu de fichiers locaux spécifiques.
*   `write_file` / `patch_file` : Écrit de nouveaux fichiers ou modifie de manière ciblée des lignes de code existantes en affichant un diff coloré dans le terminal.
*   `list_dir` / `find_files` / `grep_search` : Parcourt l'arborescence, recherche des fichiers ou filtre du texte (similaire à `grep`).
*   `run_command` : Lance des commandes shell locales (ex: `npm run test`, `git status`).

### 2. Le Serveur API (Cloud Hugging Face Space)
Une API **FastAPI** hébergée dans un conteneur Docker. Le serveur fait le pont entre le client CLI local et les modèles de langage via l'API Inference Serverless gratuite de Hugging Face :
*   **Modèle Principal** : `Qwen/Qwen2.5-72B-Instruct` (choisi pour ses excellentes performances en code et en appel d'outils).
*   **Modèle de Secours (Fallback)** : `meta-llama/Llama-3.3-70B-Instruct`. En cas d'erreur de limite de requêtes (429) ou de surcharge (503/504), le serveur bascule automatiquement et de manière transparente sur Llama pour assurer la continuité de la discussion.
*   **Règle de Recherche Préalable (Search-Before-Code)** : Le prompt système force le modèle à effectuer systématiquement une recherche sur internet (via l'outil cloud `search_web` basé sur DuckDuckGo) ou à inspecter le dossier de fichiers locaux avant de proposer ou de modifier du code.

### 3. Synchronisation de la Mémoire (HF Dataset)
Chaque session est sauvegardée dans le dataset privé Hugging Face `TheShellMaster/cypher-coder-logs` sous le chemin `logs/{nom_utilisateur}/{session_id}.json`. Vous pouvez reprendre n'importe quelle session passée grâce à la commande `/resume`.

---

## 🚀 Installation & Configuration Rapide

### 1. Installation du Client CLI
Assurez-vous d'avoir installé **Node.js** (v18+) et **Git** sur votre machine.
Dans le répertoire du projet, exécutez les commandes suivantes :
```bash
npm install
npm link --force
```
La commande globale `cypher` est maintenant disponible dans votre terminal.

### 2. Configuration du jeton Hugging Face
Définissez la variable d'environnement `HF_TOKEN` pour permettre la sauvegarde et la reprise automatique des sessions sur votre dataset Hugging Face :
*   **Sur Linux / macOS / Termux** :
    ```bash
    export HF_TOKEN="votre_jeton_d_acces_hugging_face"
    ```
    *(Ajoutez cette commande dans votre fichier `~/.bashrc` ou `~/.zshrc` pour la charger à chaque démarrage).*
*   **Sur Windows (PowerShell)** :
    ```powershell
    [System.Environment]::SetEnvironmentVariable('HF_TOKEN','votre_jeton_d_acces_hugging_face','User')
    ```

---

## 🎮 Guide d'Utilisation du CLI

Lancez l'agent conversationnel avec la commande :
```bash
cypher
```

### 1. Les trois préfixes magiques
Tout texte saisi dans le terminal peut être préfixé pour déclencher des actions spéciales :
*   **`/` -> Menu Commandes Slash** : Saisir `/` en premier caractère ouvre un menu interactif d'autocomplétion. Utilisez les flèches Haut/Bas pour sélectionner une commande et validez avec Entrée ou Tab.
*   **`@` -> Contexte Fichier** : Saisir `@` suivi du chemin d'un fichier insère instantanément le contenu de ce fichier dans votre message pour que l'IA puisse le lire (ex : `@index.js explique comment fonctionne initChat`).
*   **`!` -> Commande Shell Immédiate** : Saisir `!` suivi d'une commande système lance directement l'exécution locale sans interroger le modèle (ex : `!git status` ou `!npm run test`).

### 2. Liste des Commandes Slash Intégrées
*   `/help` : Affiche l'aide avec la liste complète des commandes.
*   `/status` : Réalise un diagnostic du système (OS, outils de développement disponibles comme Git, Docker, etc., et modèle actif).
*   `/permissions` : Gère les droits accordés à l'agent (lecture de fichiers, écriture de fichiers, exécution de commandes système).
*   `/yolo` : Active/désactive le mode YOLO (permet à l'agent d'exécuter ses actions de modification et de commande sans demander de confirmation manuelle à l'utilisateur).
*   `/resume` : Récupère la liste des sessions archivées sur Hugging Face pour reprendre une discussion précédente.
*   `/agents` : Gère et configure les sous-agents spécialisés.
*   `/model` : Permet de basculer manuellement entre les modèles disponibles (Qwen 72B et Llama 70B).
*   `/rename` : Renomme la session active.
*   `/usage` : Affiche le nombre estimé de jetons (tokens) consommés durant la session.
*   `/clear` : Nettoie l'écran du terminal.
*   `/exit` : Quitte proprement l'agent.

---

## 🔧 Personnalisation : Commandes et Sous-Agents

### 1. Créer une Commande Slash Personnalisée
Pour ajouter une commande sur mesure, créez un fichier JSON dans `~/.cypher/commands/` (globale) ou dans `.cypher/commands/` (spécifique au projet) :

**Exemple : `.cypher/commands/audit.json`**
```json
{
  "cmd": "/audit",
  "desc": "Analyse le code pour détecter des failles de sécurité",
  "prompt": "Inspecte les fichiers sources du projet actuel et dresse une liste des failles de sécurité potentielles."
}
```
Au prochain démarrage de `cypher`, la commande `/audit` sera disponible dans le menu d'autocomplétion.

### 2. Créer et Activer un Sous-Agent Spécialisé
Un sous-agent permet de modifier temporairement le profil de l'IA (ses instructions système, son modèle préféré et son comportement). Vous pouvez en créer directement avec la commande `/agents -> Créer un nouveau sous-agent`, ou en écrivant un fichier JSON dans `~/.cypher/agents/` ou `.cypher/agents/` :

**Exemple : `.cypher/agents/react_helper.json`**
```json
{
  "name": "ReactHelper",
  "role": "Tu es un expert React. Tu aides à structurer les composants en utilisant les Hooks modernes et à optimiser le rendu avec React.memo et useMemo.",
  "model": "meta-llama/Llama-3.3-70B-Instruct"
}
```
Utilisez ensuite la commande `/agents` dans le CLI pour l'activer. L'historique sera réinitialisé et l'IA adoptera son nouveau rôle.

---

## 🔒 Sécurité, Contrôle & Validation

Cypher Coder est conçu dans une optique de sécurité maximale :
*   **Par défaut**, l'agent demande votre consentement explicite avant toute action sensible :
    *   Lecture d'un fichier (optionnel selon vos réglages).
    *   Modification/Écriture d'un fichier (affichage d'un diff détaillé avant confirmation).
    *   Exécution d'une commande shell (avec affichage clair de la ligne de commande).
*   Vous pouvez ajuster ces règles à tout moment avec la commande `/permissions` ou activer le mode `/yolo` si vous faites entièrement confiance aux actions de l'agent.
