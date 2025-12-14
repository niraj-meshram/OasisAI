"""
Prompt variant loader.

Variants are stored as .txt files under backend/app/services/prompt_variants/.
File stem becomes the variant name (e.g., variant_a.txt -> "variant_a").

Always includes "default" mapped to prompt_engine.SYSTEM_PROMPT.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from app.services import prompt_engine

VARIANTS_DIR = Path(__file__).with_name("prompt_variants")


@lru_cache
def load_prompt_variants() -> dict[str, str]:
    variants: dict[str, str] = {"default": prompt_engine.SYSTEM_PROMPT}
    if VARIANTS_DIR.exists():
        for path in VARIANTS_DIR.glob("*.txt"):
            name = path.stem.strip()
            if not name:
                continue
            content = path.read_text(encoding="utf-8").strip()
            if content:
                variants[name] = content

    # Merge store-managed templates (if present).
    store_path = os.getenv("OASIS_STORE_PATH") or "oasis_store.json"
    try:
        raw = Path(store_path).read_text(encoding="utf-8").strip()
        if raw:
            data = json.loads(raw)
            if isinstance(data, dict):
                templates = data.get("prompt_templates") or {}
                if isinstance(templates, dict):
                    for name, record in templates.items():
                        if not isinstance(name, str) or not name or name == "default":
                            continue
                        if not isinstance(record, dict):
                            continue
                        versions = record.get("versions") or []
                        latest = versions[-1] if isinstance(versions, list) and versions else None
                        if isinstance(latest, dict):
                            content = latest.get("content")
                            if isinstance(content, str) and content.strip():
                                variants[name] = content.strip()
    except FileNotFoundError:
        pass
    except Exception:
        # Ignore store parsing errors; builtin variants still work.
        pass
    return variants


def list_prompt_variant_names() -> list[str]:
    return sorted(load_prompt_variants().keys())


def get_system_prompt(variant: str | None) -> str:
    variants = load_prompt_variants()
    if not variant or variant == "default":
        return variants["default"]
    if variant not in variants:
        raise ValueError(f"Unknown prompt variant '{variant}'.")
    return variants[variant]
