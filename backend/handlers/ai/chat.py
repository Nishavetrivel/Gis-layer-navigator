"""
POST /api/ai/chat
─────────────────
GIS assistant backed by Gemini.

The API key is read from Secrets Manager when ``GEMINI_SECRET_ARN`` is set,
falling back to the ``GEMINI_API_KEY`` environment variable for local runs. The
fetched secret is cached for the container's lifetime.
"""

import json
import threading
from typing import Any, Dict, Optional

from core import config
from core.http import Request, json_response

SYSTEM_INSTRUCTION = (
    "You are an expert GIS Spatial Navigator Assistant. Help the user answer questions "
    "about geographical layers, boundaries, land parcels, survey numbers, and spatial analysis."
)

_api_key: Optional[str] = None
_key_lock = threading.Lock()


def _resolve_api_key() -> str:
    """Gemini key from Secrets Manager or the environment, cached per container."""
    global _api_key
    if _api_key is not None:
        return _api_key

    with _key_lock:
        if _api_key is not None:
            return _api_key

        key = ""
        if config.GEMINI_SECRET_ARN:
            try:
                import boto3

                resp = boto3.client("secretsmanager").get_secret_value(
                    SecretId=config.GEMINI_SECRET_ARN,
                )
                raw = resp.get("SecretString") or ""
                try:
                    parsed = json.loads(raw)
                    key = parsed.get("GEMINI_API_KEY") or parsed.get("api_key") or ""
                except ValueError:
                    key = raw.strip()
            except Exception as exc:
                print("[ai/chat] Could not read Gemini secret: %s" % exc)

        _api_key = key or config.GEMINI_API_KEY_ENV
        return _api_key


def handle(request: Request) -> Dict[str, Any]:
    body = request.json()
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        return json_response({"response": "Please provide a prompt."}, status=400)

    api_key = _resolve_api_key()
    if not api_key:
        return json_response({
            "response": "GEMINI_API_KEY is not configured in the server environment.",
        })

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        full_prompt = "%s\n\nUser Question: %s" % (SYSTEM_INSTRUCTION, prompt)
        context = body.get("context")
        if context:
            full_prompt += "\nActive Map Context: %s" % json.dumps(context)

        response = client.models.generate_content(
            model=config.GEMINI_MODEL,
            contents=full_prompt,
        )
        return json_response({"response": response.text})
    except Exception as e:
        print("[ai/chat] Error calling Gemini API: %s" % e)
        return json_response({"response": "Error calling AI service: %s" % e})
