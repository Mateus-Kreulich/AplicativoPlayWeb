"""Smoke integration checks for UI flows (run with playwright in CI).

Scenarios:
1) Load app and navigate to registros.
2) Add row and edit times.
3) Trigger punch register and verify status updates.
4) Ensure report and import actions are visible.
5) Persist settings across reloads.
6) Recover from corrupted primary storage using backup.
"""
from playwright.sync_api import sync_playwright


def run(base_url: str = "http://127.0.0.1:4173") -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(f"{base_url}/index.html", wait_until="networkidle")
        page.wait_for_timeout(2600)

        page.click('#navRegistro')
        page.click('#btnAddRow')

        first_row = page.locator('#timeSheetBody tr').first
        first_row.locator('input[type="time"]').nth(0).fill('08:00')
        first_row.locator('input[type="time"]').nth(1).fill('12:00')

        page.fill('#hourlyRate', '33.33')
        page.wait_for_timeout(500)

        page.click('#navHome')
        page.click('#btnRegistrarPonto')

        next_status = page.locator('#nextStatus').inner_text()
        assert next_status.startswith('Próximo:') or 'Dia completo' in next_status
        assert page.locator('#btnImportJson').is_visible()
        assert page.locator('#btnReport').is_visible()

        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2600)
        page.click('#navRegistro')
        assert page.input_value('#hourlyRate') == '33.33'

        page.evaluate(
            """
            const key = 'controleHorasFINALMASTER';
            const backupKey = `${key}::backup`;
            localStorage.setItem(backupKey, localStorage.getItem(key));
            localStorage.setItem(key, '{invalid-json');
            """
        )

        page.reload(wait_until="networkidle")
        page.wait_for_timeout(2600)
        page.click('#navRegistro')
        assert page.input_value('#hourlyRate') == '33.33'

        browser.close()


if __name__ == "__main__":
    run()
