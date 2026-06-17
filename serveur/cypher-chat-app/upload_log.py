import sys
import os
import json
from datetime import datetime
import uuid
from io import BytesIO
from huggingface_hub import HfApi, create_repo

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

def upload_log(temp_file_path):
    try:
        with open(temp_file_path, "r", encoding="utf-8") as f:
            log_entry = json.load(f)
            
        user = api.whoami()["name"]
        repo_id = f"{user}/cypher-coder-logs"
        create_repo(repo_id, token=token, repo_type="dataset", private=True, exist_ok=True)
        
        username = log_entry.get("username", "invité")
        file_path = f"logs/{username}/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.json"
        
        content_bytes = json.dumps(log_entry, ensure_ascii=False, indent=2).encode("utf-8")
        
        api.upload_file(
            path_or_fileobj=BytesIO(content_bytes),
            path_in_repo=file_path,
            repo_id=repo_id,
            repo_type="dataset",
            token=token
        )
        print(f"Telemetry upload successful: {file_path}")
    except Exception as e:
        print(f"Telemetry upload error: {e}", file=sys.stderr)
    finally:
        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        except Exception:
            pass

if __name__ == "__main__":
    if len(sys.argv) > 1:
        upload_log(sys.argv[1])
