"""
backend/core/asyncutil.py
─────────────────────────
Bridge between the synchronous Lambda handler contract and the async service
functions carried over from the FastAPI backend (``build_merged_geojson``,
``resolve_viewport``).

Those coroutines never await real I/O — they are async only because FastAPI
route handlers were — so driving them on one long-lived per-container loop is
both correct and cheaper than ``asyncio.run`` per invocation, which builds and
tears down an event loop every time.
"""

import asyncio
import threading
from typing import Any, Coroutine, TypeVar

T = TypeVar("T")

_loop: "asyncio.AbstractEventLoop | None" = None
_loop_lock = threading.Lock()


def _get_loop() -> asyncio.AbstractEventLoop:
    global _loop
    if _loop is not None and not _loop.is_closed():
        return _loop
    with _loop_lock:
        if _loop is None or _loop.is_closed():
            _loop = asyncio.new_event_loop()
            asyncio.set_event_loop(_loop)
    return _loop


def run_sync(coro: Coroutine[Any, Any, T]) -> T:
    """Run a coroutine to completion from synchronous code."""
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None

    if running is not None:
        # Already inside a loop (e.g. the local dev server) — hand it off.
        return asyncio.run_coroutine_threadsafe(coro, running).result()

    return _get_loop().run_until_complete(coro)
