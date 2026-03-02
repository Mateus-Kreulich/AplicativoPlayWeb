"""Wrapper de compatibilidade para o smoke test de UI.

Mantém um caminho alternativo em português sem duplicar lógica.
"""
from pathlib import Path
import runpy

if __name__ == "__main__":
    target = Path(__file__).resolve().parent.parent / "tests" / "ui-integration.playwright.py"
    runpy.run_path(str(target), run_name="__main__")
