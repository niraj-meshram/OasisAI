"""
Data policy helpers to keep PoC inputs to public/anonymized data only.
"""

from collections.abc import Iterable

# Lightweight keyword heuristics; this is a guardrail, not content inspection.
PRIVATE_MARKERS = {
    "customer",
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
    negations = ("no ", "not ", "without ", "avoid ")
    for value in values:
        if not value:
            continue
        text = value.lower()
        for marker in PRIVATE_MARKERS:
            if marker not in text:
                continue
            # skip if marker is clearly negated (e.g., "no confidential data")
            if any(f"{neg}{marker}" in text for neg in negations):
                continue
                hits.add(marker)
    return sorted(hits)
