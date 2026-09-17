"""Generate a static Finnish UI locale from the maintained English locale.

This developer tool uses an installed Argos en->fi model. Runtime clients do
not depend on Python, Argos, a network connection, or this script.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from argostranslate import translate


PROTECTED = re.compile(
    r"\{[^{}]+\}|https?://\S+|[\w.+-]+@[\w.-]+\.\w+|"
    r"\b(?:Supply Chain Hub|Nexi|TCD|TRR|Ctrl\+K|DOCX|PDF|Word|Excel|Arcade)\b",
    re.IGNORECASE,
)


def translate_string(value: str) -> str:
    if not value.strip():
        return value

    protected: list[str] = []

    def replace(match: re.Match[str]) -> str:
        protected.append(match.group(0))
        return f"ZXQPH{len(protected) - 1:03d}QXZ"

    masked = PROTECTED.sub(replace, value)
    translated = translate.translate(masked, "en", "fi")
    for index, original in enumerate(protected):
        translated = translated.replace(f"ZXQPH{index:03d}QXZ", original)
        translated = translated.replace(f"ZXQPH {index:03d} QXZ", original)
    return translated


def walk(value):
    if isinstance(value, str):
        return translate_string(value)
    if isinstance(value, list):
        return [walk(item) for item in value]
    if isinstance(value, dict):
        return {key: walk(item) for key, item in value.items()}
    return value


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate_finnish_translations.py input.json output.json")
    source = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    translated = walk(source)
    Path(sys.argv[2]).write_text(
        json.dumps(translated, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Translated {len(json.dumps(source, ensure_ascii=False))} source characters")


if __name__ == "__main__":
    main()
