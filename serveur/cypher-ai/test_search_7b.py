import os
os.environ.pop("HF_TOKEN", None)

import json
import uuid
from datetime import datetime
from io import BytesIO
from huggingface_hub import InferenceClient, HfApi
from duckduckgo_search import DDGS

# Use anonymous client for inference
client = InferenceClient() # No token!

SYSTEM_PROMPT = "Tu es Cypher AI, assistant IA en monospace."
tools = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Fait une recherche sur internet.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "La requête."}
                },
                "required": ["query"]
            }
        }
    }
]

def search_web(query):
    try:
        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=2))
        return str(results)
    except Exception as e:
        return str(e)

def test_run():
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "Cherche sur le web : actualités IA d'aujourd'hui."}
    ]
    
    # 1. First completion to see if it calls tool
    response = client.chat_completion(
        model="Qwen/Qwen2.5-Coder-7B-Instruct",
        messages=messages,
        tools=tools,
        max_tokens=200,
        stream=False
    )
    
    choice = response.choices[0]
    print("Has tool calls:", bool(choice.message.tool_calls))
    
    if choice.message.tool_calls:
        tool_calls_list = []
        for tc in choice.message.tool_calls:
            tool_calls_list.append({
                "id": tc.id,
                "type": tc.type,
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments
                }
            })
        
        messages.append({
            "role": "assistant",
            "tool_calls": tool_calls_list
        })
        
        for tc in choice.message.tool_calls:
            if tc.function.name == "search_web":
                args = json.loads(tc.function.arguments)
                q = args.get("query", "")
                res = search_web(q)
                print("Search result:", res[:100])
                messages.append({
                    "role": "tool",
                    "name": "search_web",
                    "tool_call_id": tc.id,
                    "content": res
                })
        
        # 2. Second completion
        final_response = client.chat_completion(
            model="Qwen/Qwen2.5-Coder-7B-Instruct",
            messages=messages,
            max_tokens=200,
            stream=False
        )
        print("Final response:", final_response.choices[0].message.content)

test_run()
