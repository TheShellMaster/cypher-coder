FROM python:3.10-slim

WORKDIR /app

# Installer les dépendances système nécessaires
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copier et installer les packages Python
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copier le code de l'application
COPY . /app

# Exposer le port de l'application (7860)
EXPOSE 7860

# Lancer le serveur Uvicorn avec notre application FastAPI
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
