"""
backend/functions/ai_api/app.py
───────────────────────────────
AI assistant API.

Gemini-backed GIS chat assistant.
"""

from core.router import Router
from handlers.ai import chat

router = Router("ai_api")
(
    router
    .post("/api/ai/chat", chat.handle)
)

lambda_handler = router.as_lambda_handler()
