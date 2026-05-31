# 💻 Cypher Coder - Agent IA de Programmation CLI

**Cypher Coder** est un agent conversationnel en ligne de commande (CLI) autonome, capable de concevoir, lire, modifier du code localement et d'exécuter des commandes système directement dans votre terminal sous votre supervision.

Ce projet a été conçu et développé par **DJAKOUA KWANKAM**, étudiant en informatique à l'**Institut Universitaire de Douala (IUD)**.

---

## 🏗️ Architecture & Fonctionnement

L'architecture de Cypher Coder repose sur un modèle hybride Client-Serveur conçu pour maximiser les performances tout en s'exécutant sur des machines aux ressources limitées.

```
+-----------------------------------------------------------------+
|                        MACHINE LOCALE                           |
|                                                                 |
|   +-------------+      Prompt      +------------------------+   |
|   |             | +--------------> |                        |   |
|   |  Terminal   |                  |    Client CLI Node     |   |
|   |  Utilisateur| <--------------+ | (index.js / Inquirer)  |   |
|   |             |      Réponse     |                        |   |
|   +-------------+                  +------------------------+   |
|                                      ^                  |       |
|                                      | Outil            | API   |
|                                      | Local            | Chat  |
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
|   +-----------------------+              +------------------+   |
|   |                       |  Inference   |                  |   |
|   |   FastAPI Gateway     | +----------> |  Qwen-2.5-Coder  |   |
|   |                       |              |    (32B Model)   |   |
|   +-----------------------+              +------------------+   |
|               |                                                 |
|               | Outil search_web                                |
|               v                                                 |
|   +-----------------------+                                     |
|   |   DuckDuckGo Search   |                                     |
|   +-----------------------+                                     |
+-----------------------------------------------------------------+
```

### 1. Le Client CLI (Local)
Développé en **Node.js**, il gère l'interface interactive utilisateur dans le terminal à l'aide de `chalk`, `ora` et `inquirer`. Il expose des outils système :
*   `read_file` : Permet au modèle de lire le contenu des fichiers locaux.
*   `write_file` : Permet d'écrire ou de modifier du code source local.
*   `list_dir` : Permet au modèle d'inspecter la structure des répertoires locaux.
*   `run_command` : Exécute des commandes système (compilation, tests unitaires, git, etc.).

### 2. Le Serveur API (Hugging Face Space)
Un conteneur Docker exécutant une application **FastAPI** avec un redirect vers une interface **Gradio** à `/gradio` pour tester l'agent en ligne. Le serveur communique avec l'API Hugging Face Serverless pour interroger le modèle de pointe **Qwen/Qwen2.5-Coder-32B-Instruct**.

### 3. La Boucle d'Agent Hybride (Hybrid Agent Loop)
*   Lorsque le modèle demande une recherche sur internet (`search_web`), celle-ci est résolue directement par le serveur dans le cloud via DuckDuckGo.
*   Lorsque le modèle demande une action système locale (lire un fichier, exécuter une commande), le serveur renvoie l'instruction au client CLI local qui l'exécute après avoir demandé le consentement explicite de l'utilisateur.

---

## 🛠️ Défis Techniques & Résolutions

### 1. Le blocage DNS/TCP de Node.js vers Hugging Face
*   **Problème** : L'environnement réseau local de l'utilisateur souffrait d'une configuration IPv6 défaillante. Node.js tentait de résoudre et de contacter `api-inference.huggingface.co` en IPv6, entraînant des timeouts systématiques (`ETIMEDOUT` / `ENOTFOUND`).
*   **Résolution** : Le client local a été réécrit pour effectuer ses requêtes API via l'outil système `curl` (exécuté comme un processus fils dans Node.js). `curl` gère de manière transparente et instantanée le repli d'IPv6 vers IPv4, restaurant une connexion instantanée.

### 2. Collision de Ports (Errno 98) sous le SDK Gradio
*   **Problème** : Sous le SDK par défaut `gradio` de Hugging Face, le lanceur interne de la plateforme démarre automatiquement son propre serveur sur le port `7860`. En voulant y greffer nos endpoints personnalisés FastAPI via `uvicorn.run(...)`, une erreur de collision de port est survenue, faisant crasher le conteneur.
*   **Résolution** : Migration de l'Espace vers le SDK **Docker** avec un `Dockerfile` sur mesure. Le serveur Uvicorn est désormais démarré de manière unique et propre via l'instruction `CMD` du conteneur Docker, garantissant une cohabitation parfaite de l'API et de Gradio sur le port `7860`.

---

## 🚀 Guide d'Installation (Linux / Windows / Termux)

### 📋 Prérequis Communs
1. Un compte Hugging Face.
2. Un jeton d'accès Hugging Face (Access Token) avec droits d'écriture, à placer en variable d'environnement ou dans votre configuration.

---

### 🐧 1. Installation sur Linux (Ubuntu/Debian/Arch...)

1.  **Installer Node.js & Git** :
    ```bash
    sudo apt update
    sudo apt install -y nodejs npm git curl
    ```
2.  **Cloner le projet** :
    ```bash
    git clone https://github.com/TheShellMaster/cypher-coder.git
    cd cypher-coder
    ```
3.  **Installer les dépendances** :
    ```bash
    npm install
    ```
4.  **Assurer les permissions d'exécution** :
    ```bash
    chmod +x index.js
    ```
5.  **Lier la commande globalement** :
    ```bash
    npm link
    ```
6.  **Lancer l'agent** :
    ```bash
    cypher
    ```

---

### 🪟 2. Installation sur Windows (Command Prompt / PowerShell)

1.  **Installer les dépendances requises** :
    *   Téléchargez et installez **Node.js** depuis le site officiel : [nodejs.org](https://nodejs.org/).
    *   Téléchargez et installez **Git** depuis [git-scm.com](https://git-scm.com/).
    *   Installez **curl** (inclus par défaut dans Windows 10/11 sous PowerShell).
2.  **Cloner et configurer** :
    Ouvrez PowerShell en tant qu'administrateur :
    ```powershell
    git clone https://github.com/TheShellMaster/cypher-coder.git
    cd cypher-coder
    npm install
    ```
3.  **Créer le lien global** :
    ```powershell
    npm link
    ```
4.  **Lancer l'agent** :
    ```powershell
    cypher
    ```

---

### 📱 3. Installation sur Android (Termux)

1.  **Installer et mettre à jour Termux** (depuis F-Droid de préférence).
2.  **Installer les paquets nécessaires** :
    ```bash
    pkg update && pkg upgrade -y
    pkg install -y nodejs-lts git curl
    ```
3.  **Cloner le dépôt** :
    ```bash
    git clone https://github.com/TheShellMaster/cypher-coder.git
    cd cypher-coder
    ```
4.  **Installer les modules** :
    ```bash
    npm install
    ```
5.  **Rendre index.js exécutable** :
    ```bash
    chmod +x index.js
    ```
6.  **Créer un raccourci global** :
    ```bash
    npm link
    ```
7.  **Lancer l'agent** :
    ```bash
    cypher
    ```

---

## 🔒 Sécurité et Consentement

Par mesure de sécurité, Cypher Coder n'apporte aucune modification à votre système de fichiers et n'exécute aucune commande système en tâche de fond de manière opaque. 
*   Pour **toute création/modification de fichier**, vous devrez appuyer sur `Y` pour valider.
*   Pour **toute exécution de commande système** (comme un `npm install` ou `git commit`), vous devrez valider explicitement avec `Y` (l'option par défaut étant `Non`).
