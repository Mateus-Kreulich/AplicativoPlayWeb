(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.UiUtils = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function escapeCsvValue(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function rowsToCsv(headers, rows, separator = ';') {
    return [headers, ...rows]
      .map(row => row.map(escapeCsvValue).join(separator))
      .join("\n");
  }

  function parseImportJson(text, migrateFn) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'JSON inválido.' };
    }

    let migrated;
    try {
      migrated = migrateFn(parsed);
    } catch {
      return { ok: false, error: 'Falha ao processar dados importados.' };
    }

    if (!migrated) {
      return { ok: false, error: 'Estrutura de dados não suportada.' };
    }

    return { ok: true, state: migrated };
  }

  function buildReportHtml({ title, generatedAt, tableHtml, totalsHtml }) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="./styles.css"></head><body><main class="container"><div class="card"><h2>${title}</h2><p>Gerado em: ${generatedAt}</p>${tableHtml}${totalsHtml}</div></main></body></html>`;
  }


  function isDebugEnabled() {
    return localStorage.getItem("dragonpoint_debug") === "1";
  }

  function persistClientLog(payload) {
    const key = "dragonpoint_logs";
    const current = JSON.parse(localStorage.getItem(key) || "[]");
    current.push(payload);
    while (current.length > 100) current.shift();
    localStorage.setItem(key, JSON.stringify(current));
  }

  function logEvent(level, message, data) {
    const payload = { level, message, data: data || null, at: new Date().toISOString() };
    persistClientLog(payload);
    if (!isDebugEnabled() && level !== "error") return;
    if (level === "error") console.error("[DragonPoint]", payload);
    else if (level === "warn") console.warn("[DragonPoint]", payload);
    else console.log("[DragonPoint]", payload);
  }

  return { escapeCsvValue, rowsToCsv, parseImportJson, buildReportHtml, logEvent, isDebugEnabled };
});
