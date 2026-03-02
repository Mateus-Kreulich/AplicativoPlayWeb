"""Smoke integration checks for UI flows (run with playwright in CI).

Scenarios:
1) Load app and navigate to registros.
2) Add row and edit times.
3) Trigger punch register and verify status updates.
4) Ensure report button and import button are visible.
"""
from playwright.sync_api import sync_playwright


def run(base_url: str = "http://127.0.0.1:4173") -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(f"{base_url}/index.html", wait_until="networkidle")
        page.wait_for_timeout(2600)

        page.click('button[aria-label="Ir para página de registros"]')
        page.click('button:has-text("Adicionar Dia")')

        first_row = page.locator('#timeSheetBody tr').first
        first_row.locator('input[type="time"]').nth(0).fill('08:00')
        first_row.locator('input[type="time"]').nth(1).fill('12:00')

        page.click('button[aria-label="Ir para página inicial"]')
        page.click('button[aria-label="Registrar horário do ponto"]')

        assert page.locator('#nextStatus').inner_text().startswith('Próximo:') or 'Dia completo' in page.locator('#nextStatus').inner_text()
        assert page.locator('button:has-text("Importar JSON")').is_visible()
        assert page.locator('button:has-text("RELATÓRIO")').is_visible()

        browser.close()


if __name__ == "__main__":
    run()
