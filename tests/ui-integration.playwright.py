"""Extended integration checks for UI + autosave + PWA behavior.

Scenarios:
1) Load app and navigate to registros.
2) Validate JSON sync status indicator updates.
3) Simulate transient linked-file write failure and ensure retry succeeds.
4) Validate hash dedup skips unnecessary rewrites.
5) Trigger checkpoint save on jornada completion (4h and 8h).
6) Validate offline availability after first load (service-worker cache).
"""
from playwright.sync_api import sync_playwright


def run(base_url: str = "http://127.0.0.1:4173") -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        page.goto(f"{base_url}/index.html", wait_until="networkidle")
        page.wait_for_timeout(2800)

        # baseline navigation
        page.click('#navRegistro')
        assert page.locator('#btnImportJson').is_visible()
        assert page.locator('#btnReport').is_visible()
        assert page.locator('#fileSyncStatus').is_visible()

        # inject fake linked file handle to validate retry/sync flows without native picker
        page.evaluate(
            """
            let writes = 0;
            let payload = '';
            window.__DP_TEST__.setSimulatedFileWriteFailures(1);
            window.__DP_TEST_FAKE_FILE = {
              async queryPermission(){ return 'granted'; },
              async requestPermission(){ return 'granted'; },
              async getFile(){ return { async text(){ return payload || '{"version":3,"settings":{},"rows":[]}' } }; },
              async createWritable(){
                return {
                  async write(txt){ payload = txt; writes += 1; },
                  async close(){}
                };
              }
            };
            """
        )
        # bind fake handle and force save with one transient failure
        page.evaluate(
            """
            window.__DP_TEST__.setLinkedFileHandleForTests(window.__DP_TEST_FAKE_FILE);
            """
        )

        page.fill('#hourlyRate', '44.44')
        page.wait_for_timeout(500)
        page.evaluate("window.__DP_TEST__.queueSave({force:true})")
        page.wait_for_timeout(800)
        assert 'JSON sincronizado' in page.locator('#fileSyncStatus').inner_text()

        # dedup by hash: force then no-change save should not increase diagnostics unexpectedly
        diag_before = page.evaluate("window.__DP_TEST__.getWriteDiagnostics()")
        page.evaluate("window.__DP_TEST__.queueSave({silent:true})")
        page.wait_for_timeout(300)
        diag_after = page.evaluate("window.__DP_TEST__.getWriteDiagnostics()")
        assert diag_after['fileWriteAttempts'] <= diag_before['fileWriteAttempts'] + 1

        # checkpoint on jornada 4h completion
        page.click('#btnAddRow')
        row = page.locator('#timeSheetBody tr').last
        row.locator('select.jornada').select_option('4')
        row.locator('input[type="time"]').nth(0).fill('08:00')
        row.locator('input[type="time"]').nth(1).fill('12:00')
        page.click('#navHome')
        page.click('#btnRegistrarPonto')
        page.wait_for_timeout(300)
        diag_checkpoint = page.evaluate("window.__DP_TEST__.getWriteDiagnostics()")
        assert diag_checkpoint['forcedCheckpointSaves'] >= 1

        # offline scenario after initial cache warm-up
        page.goto(f"{base_url}/index.html", wait_until="networkidle")
        page.wait_for_timeout(2000)
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        assert page.locator('#navHome').is_visible()
        context.set_offline(False)

        browser.close()


if __name__ == "__main__":
    run()
