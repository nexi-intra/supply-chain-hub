"""Print an apply_patch patch that adds Finnish to simple DA/EN UI ternaries.

The script is a developer aid only. It never writes source files itself; its
output is reviewed/applied with the repository patch tool.
"""

from __future__ import annotations

import re
import difflib
from pathlib import Path

from argostranslate import translate

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "src"
LITERAL = r"(?:'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`)"
TERNARY = re.compile(
    rf"(?P<variable>\b(?:language|appLanguage)\b)\s*===\s*(?P<lang>['\"](?:da|en)['\"])"
    rf"(?P<between>\s*\?\s*)(?P<yes>{LITERAL})(?P<colon>\s*:\s*)(?P<no>{LITERAL})",
    re.MULTILINE,
)
BOOLEAN_TERNARY = re.compile(
    rf"\bda(?P<between>\s*\?\s*)(?P<yes>{LITERAL})(?P<colon>\s*:\s*)(?P<no>{LITERAL})",
    re.MULTILINE,
)
BOOLEAN_LANGUAGE_FILES = {"AccessContextPicker.tsx", "ObserverWorkspace.tsx", "UpdateNotification.tsx"}

OVERRIDES = {
    "Cancel": "Peruuta",
    "Close": "Sulje",
    "Create": "Luo",
    "Delete": "Poista",
    "Edit": "Muokkaa",
    "Loading…": "Ladataan…",
    "Manager": "Esihenkilö",
    "No": "Ei",
    "Read only": "Vain luku",
    "Reload": "Lataa uudelleen",
    "Save": "Tallenna",
    "Search": "Hae",
    "Yes": "Kyllä",
}
PROTECTED = re.compile(
    r"\$\{[^{}]+\}|https?://\S+|[\w.+-]+@[\w.-]+\.\w+|"
    r"\b(?:Supply Chain Hub|Nexi|TCD|TRR|DOCX|PDF|Word|Excel|Arcade)\b",
    re.IGNORECASE,
)


def decode_literal(literal: str) -> str:
    quote = literal[0]
    value = literal[1:-1]
    value = value.replace(f"\\{quote}", quote).replace("\\n", "\n")
    return value.replace("\\\\", "\\")


def encode_literal(value: str, quote: str) -> str:
    escaped = value.replace("\\", "\\\\").replace(quote, f"\\{quote}").replace("\n", "\\n")
    return f"{quote}{escaped}{quote}"


def translate_to_finnish(value: str) -> str:
    if value in OVERRIDES:
        return OVERRIDES[value]
    protected: list[str] = []

    def mask(match: re.Match[str]) -> str:
        protected.append(match.group(0))
        return f"ZXQPH{len(protected) - 1:03d}QXZ"

    translated = translate.translate(PROTECTED.sub(mask, value), "en", "fi")
    for index, original in enumerate(protected):
        translated = translated.replace(f"ZXQPH{index:03d}QXZ", original)
        translated = translated.replace(f"ZXQPH {index:03d} QXZ", original)
    return translated


def main() -> None:
    patches: list[tuple[Path, str, str]] = []
    cache: dict[str, str] = {}
    for path in sorted((*SOURCE_ROOT.rglob("*.ts"), *SOURCE_ROOT.rglob("*.tsx"))):
        if path.name in {"translations.ts"}:
            continue
        source = path.read_text(encoding="utf-8")
        change_count = 0

        def replace_ternary(match: re.Match[str]) -> str:
            nonlocal change_count
            old = match.group(0)
            if "language === 'fi'" in old or 'language === "fi"' in old:
                return old
            yes = decode_literal(match.group("yes"))
            no = decode_literal(match.group("no"))
            source_language = match.group("lang")[1:-1]
            english = yes if source_language == "en" else no
            finnish = cache.setdefault(english, translate_to_finnish(english))
            quote = match.group("yes")[0] if source_language == "en" else match.group("no")[0]
            fi_literal = encode_literal(finnish, quote)
            variable = match.group("variable")
            replacement = (
                f"{variable} === {match.group('lang')}{match.group('between')}{match.group('yes')}"
                f"{match.group('colon')}{variable} === 'fi' ? {fi_literal} : {match.group('no')}"
            )
            change_count += 1
            return replacement

        updated = TERNARY.sub(replace_ternary, source)
        if path.name in BOOLEAN_LANGUAGE_FILES:
            def replace_boolean_ternary(match: re.Match[str]) -> str:
                nonlocal change_count
                english = decode_literal(match.group("no"))
                finnish = cache.setdefault(english, translate_to_finnish(english))
                fi_literal = encode_literal(finnish, match.group("no")[0])
                change_count += 1
                return (
                    f"da{match.group('between')}{match.group('yes')}"
                    f"{match.group('colon')}fi ? {fi_literal} : {match.group('no')}"
                )

            updated = BOOLEAN_TERNARY.sub(replace_boolean_ternary, updated)
        if change_count:
            patches.append((path, source, updated))

    print("*** Begin Patch")
    for path, source, updated in patches:
        print(f"*** Update File: {path}")
        diff = difflib.unified_diff(
            source.splitlines(), updated.splitlines(), fromfile="source", tofile="updated", lineterm="", n=3,
        )
        for line in diff:
            if line.startswith("---") or line.startswith("+++"):
                continue
            print(line)
    print("*** End Patch")


if __name__ == "__main__":
    main()
