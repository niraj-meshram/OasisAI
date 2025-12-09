"""
Data policy helpers to keep PoC inputs to public/anonymized data only.
"""

from collections.abc import Iterable

# Lightweight keyword heuristics; this is a guardrail, not content inspection.
PRIVATE_MARKERS = {
    "customer data",
    "client data",
    "pii",
    "phi",
    "ssn",
    "social security",
    "passport",
    "driver's license",
    "confidential",
    "proprietary",
    "internal only",
    "non-public",
    "production data",
    "employee data",
    "personally identifiable",
    "credit card",
    "account number",
}


def find_private_indicators(values: Iterable[str | None]) -> list[str]:
    """
    Return a list of markers detected in user-supplied text.
    """
    hits: set[str] = set()
    negation_tokens = ("no", "not", "without", "avoid")

    def is_negated(text: str, marker: str) -> bool:
        """
        Treat a marker as negated if a negation token appears within a short window
        before it (e.g., "avoid pii and phi", "no confidential or proprietary data").
        """
        tokens = text.split()
        for idx, tok in enumerate(tokens):
            if marker not in tok:
                continue
            window = tokens[max(0, idx - 3) : idx]
            if any(any(w.startswith(neg) for neg in negation_tokens) for w in window):
                return True
            if "avoid" in window:
                return True
        # fallback for simple substring patterns
        if any(f"{neg} {marker}" in text for neg in negation_tokens):
            return True
        return False

    for value in values:
        if not value:
            continue
        text = value.lower()
        for marker in PRIVATE_MARKERS:
            if marker not in text:
                continue
            # skip if marker is clearly negated (e.g., "avoid pii and phi")
            if is_negated(text, marker):
                continue
            hits.add(marker)
    return sorted(hits)
