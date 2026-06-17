# 💬 Cypher AI — Chat Web App (Standalone)

**Cypher AI Chat App** est une application web standalone (Desktop et Mobile responsive) qui fournit une interface utilisateur moderne, fluide et hautement interactive pour communiquer avec **Cypher AI**, l'assistant d'élite en programmation et conception logicielle développé pour **DJAKOUA KWANKAM**, étudiant en informatique à l'**Institut Universitaire de Technologie de Douala (IUT)**.

Cette application prend en charge la recherche d'informations en temps réel sur internet (RAG) et l'intégration directe de fichiers de code locaux pour analyse.

---

## 🏗️ Architecture & Fonctionnement

L'application est conçue pour fonctionner de manière autonome en local ou sur mobile. Elle propose deux modes de connexion configurables dans les réglages :

```
                                    +-----------------------+
                                    |   Interface Gradio    |
                                    |  (Hugging Face Space) |
                                    +-----------------------+
                                                |
+-----------------------------------------------+-----------------------------------------------+
|                               APPLICATION CHAT CYPHER AI (LOCAL)                              |
|                                                                                               |
|      +---------------------+        Requêtes HTTP        +----------------------------+       |
|      |  Interface Client   | <=========================> |       Serveur Local        |       |
|      |    (HTML/CSS/JS)    |         SSE / JSON          |        (server.js)         |       |
|      +---------------------+                             +----------------------------+       |
|                 |                                                      |                      |
|                 | Mode Direct                                          | Recherche RAG        |
|                 v                                                      v                      |
|      +---------------------+                                 +----------------------------+   |
|      |   API Hugging Face  |                                 |   Recherche DuckDuckGo     |   |
|      | Serverless (Router) | <============================== |   (IPv4 Force / HTTPS)     |   |
|      +---------------------+        Inférence Qwen           +----------------------------+   |
+-----------------------------------------------------------------------------------------------+
```

### 1. Mode Serveur Local (Recommandé - RAG Web Actif)
Dans ce mode, l'interface client communique avec un serveur local Node.js (`server.js`). Le serveur gère :
*   L'interrogation du moteur de recherche DuckDuckGo lorsque des requêtes nécessitent des informations récentes.
*   L'injection des résultats de recherche pertinents dans le contexte du modèle (RAG).
*   La journalisation d'événements intermédiaires et le streaming temps réel (SSE) des étapes de recherche vers l'interface utilisateur.
*   L'exécution transparente de scripts de télémétrie en arrière-plan pour archiver anonymement les interactions dans un dataset privé Hugging Face (`TheShellMaster/cypher-coder-logs`).

### 2. Mode Direct (Sans Serveur - API Hugging Face)
Le client communique directement depuis le navigateur avec l'API Hugging Face Serverless en utilisant le modèle `Qwen/Qwen2.5-Coder-7B-Instruct`. C'est un mode léger ne nécessitant pas de serveur local, mais n'intégrant pas la recherche web en temps réel.

---

## 🛠️ Outils & Fonctionnalités Clés

### 📁 1. Analyseur de Fichiers Attachés (Context Upload)
*   **Fonctionnalité** : Les utilisateurs peuvent joindre des fichiers de code ou de texte (extensions supportées : `.js`, `.py`, `.html`, `.css`, `.json`, `.md`, etc.) via un sélecteur de fichiers ou par simple glisser-déposer (Drag & Drop) dans la zone de chat.
*   **Limitation & Sécurité** : Les fichiers sont limités à 500 Ko par fichier pour éviter de saturer la fenêtre de contexte de l'IA. Seuls les fichiers textuels sont acceptés (détection automatique des fichiers binaires pour éviter les corruptions).
*   **Rendu** : Le contenu des fichiers est structuré sous forme de blocs de code Markdown annotés, prêts à être analysés par l'IA lors du prochain envoi de message.

### 🔍 2. Journal de Recherche & Sources (Style Perplexity/Claude)
*   **Flux de logs en temps réel** : Dès que la recherche en ligne est sollicitée, le serveur renvoie immédiatement des événements SSE contenant des indicateurs de progression.
*   **Rendu Visuel Interactif** : L'interface utilisateur génère dynamiquement un conteneur de logs dédié (`.search-logs-box`) :
    *   **Étapes Défilantes** : Affichage successif des actions de l'agent (ex. *Initialisation de la recherche...*, *Recherche de "actualités minecraft"...*, *Analyse des sources...*, *Réflexion...*).
    *   **Cartes de Sources** : Une grille interactive de cartes présentant les sources trouvées avec extraction automatique du nom de domaine (ex. `minecraft.net`) et numérotation.
    *   **Repli Automatique (Collapse)** : Dès que le modèle commence à générer sa réponse finale, le panneau de logs se rétracte pour un aspect propre, tout en restant dépliable en un clic.

---

## 💥 Problèmes Techniques Rencontrés & Solutions

Au cours du développement de l'application, plusieurs défis complexes ont été surmontés pour garantir la stabilité et une expérience utilisateur haut de gamme :

### 1. Résolution de la Date & Biais Historique (Cutoff 2023 vs 2026)
*   **Problème** : Le modèle `Qwen2.5-Coder-7B-Instruct` possède une limite de connaissances (cutoff) fixée à 2023. Même en disposant de résultats de recherche web récents, si l'utilisateur lui demandait l'année en cours, le modèle répondait systématiquement qu'il était en 2023 en raison de son alignement interne rigide.
*   **Résolution** : Nous avons injecté un bloc de contexte temporel hautement autoritaire (`[INFO TEMPORELLE CRITIQUE]`) en tête du prompt système à chaque requête. Ce bloc force l'IA à utiliser la date dynamique générée par l'hôte (juin 2026) et lui interdit explicitement de faire référence à 2023 ou 2024. Le modèle répond maintenant avec exactitude et confiance qu'il est en **2026**.

### 2. Timeouts Réseau et Résolution Double Pile DNS (IPv6)
*   **Problème** : Sur les réseaux configurés en double pile (IPv4/IPv6) dont la connectivité IPv6 locale est défectueuse, les appels d'inférence Node.js vers Hugging Face et les requêtes DuckDuckGo tombaient en timeout systématique (`ETIMEDOUT` ou `ENOTFOUND`) car Node résout par défaut les adresses IPv6 en premier.
*   **Résolution** :
    1.  Nous avons programmatiquement forcé la résolution IPv4 en priorité globale dans le serveur à l'aide de :
        ```javascript
        dns.setDefaultResultOrder("ipv4first");
        ```
    2.  Pour la recherche DuckDuckGo sur HTTPS, nous avons spécifié l'option `family: 4` dans les options de la requête `https.get` pour garantir le repli instantané vers IPv4.

### 3. Collision des Flux SSE (Text Completion vs Status Logs)
*   **Problème** : Le protocole SSE classique transmet uniquement le flux de génération de texte de l'IA. Si nous devions attendre la fin de la recherche web pour envoyer le flux, l'utilisateur ferait face à un écran figé sans savoir si l'application recherche activement.
*   **Résolution** : Les en-têtes SSE sont désormais ouverts **immédiatement** dès la réception de la requête HTTP. Le serveur écrit des paquets JSON typés (`data: {"type": "log", "message": "...", "status": "..."}`) tout au long du processus RAG. Côté client, le lecteur de flux distingue ces paquets de logs des jetons de texte de l'IA (`choices[0].delta.content`) afin de mettre à jour le panneau de chargement avant de démarrer le rendu Markdown de la réponse.

---

## 🚀 Installation & Lancement

### 📦 Prérequis
*   **Node.js** (v18 ou supérieur)
*   Un **Access Token Hugging Face** (optionnel, pour l'inférence gratuite)

### ⚙️ Configuration
Créez un fichier `.env` à la racine du projet `cypher-chat-app` :
```env
HF_TOKEN=votre_token_hugging_face_ici
PORT=3000
```

### 🏁 Lancement
1.  Installez les dépendances :
    ```bash
    npm install
    ```
2.  Démarrez le serveur local :
    ```bash
    npm start
    ```
3.  Ouvrez votre navigateur à l'adresse : [http://localhost:3000](http://localhost:3000)
