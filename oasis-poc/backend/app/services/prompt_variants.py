"""
Prompt variant loader.

Variants are stored as .txt files under backend/app/services/prompt_variants/.
File stem becomes the variant name (e.g., variant_a.txt -> "variant_a").

Always includes "default" mapped to prompt_engine.SYSTEM_PROMPT.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.services import prompt_engine

VARIANTS_DIR = Path(__file__).with_name("prompt_variants")


@lru_cache
def load_prompt_variants() -> dict[str, str]:
    variants: dict[str, str] = {"default": prompt_engine.SYSTEM_PROMPT}
    if not VARIANTS_DIR.exists():
        return variants

    for path in VARIANTS_DIR.glob("*.txt"):
        name = path.stem.strip()
        if not name:
            continue
        content = path.read_text(encoding="utf-8").strip()
        if content:
            variants[name] = content
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

