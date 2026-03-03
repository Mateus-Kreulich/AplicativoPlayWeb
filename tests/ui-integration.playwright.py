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
        page.wait_for_function("() => typeof window.__DP_TEST__ !== 'undefined'", timeout=15000)

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

        page.click('#btnToggleConfig')
        page.locator('#hourlyRate').wait_for(state='visible')
        page.fill('#hourlyRate', '44.44')
        page.wait_for_timeout(500)
        page.evaluate("window.__DP_TEST__.queueSave({force:true})")
        page.wait_for_timeout(800)
        assert 'JSON sincronizado' in page.locator('#fileSyncStatus').inner_text()

        # dedup by hash: force then no-change save should not increase diagnostics unexpectedly
        diag_before = page.evaluate("window.__DP_TEST__.getWriteDiagnostics()")
        page.evaluate("window.__DP_TEST__.queueSave({silent:true})")
        page.wait_for_timeout(500)
        diag_after = page.evaluate("window.__DP_TEST__.getWriteDiagnostics()")
        assert diag_after['fileWriteAttempts'] == diag_before['fileWriteAttempts']

        # checkpoint on jornada 4h completion (linha de hoje)
        page.evaluate(
            """
            const hoje = new Date().toISOString().split('T')[0];
            const rows = [...document.querySelectorAll('#timeSheetBody tr')];
            let row = rows.find(r => r.querySelector('input[type=date]')?.value === hoje);
            if(!row){
              document.getElementById('btnAddRow').click();
              row = [...document.querySelectorAll('#timeSheetBody tr')].at(-1);
              row.querySelector('input[type=date]').value = hoje;
            }
            row.querySelector('select.jornada').value = '4';
            row.querySelectorAll('input[type=time]')[0].value = '';
            row.querySelectorAll('input[type=time]')[1].value = '';
            row.querySelectorAll('input[type=time]')[2].value = '';
            row.querySelectorAll('input[type=time]')[3].value = '';
            """
        )
        page.click('#navHome')
        page.click('#btnRegistrarPonto')
        page.click('#btnRegistrarPonto')
        page.wait_for_timeout(500)
        diag_checkpoint = page.evaluate("window.__DP_TEST__.getWriteDiagnostics()")
        assert diag_checkpoint['forcedCheckpointSaves'] >= 1

        # offline scenario after initial cache warm-up and SW control
        page.goto(f"{base_url}/index.html", wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.wait_for_function("() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)", timeout=15000)
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        assert page.locator('#navHome').is_visible()
        context.set_offline(False)

        browser.close()


if __name__ == "__main__":
    run()
