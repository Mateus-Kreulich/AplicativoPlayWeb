(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.AppState = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createDefaultState() {
    return {
      version: 1,
      settings: { hourlyRate: "12.50", overtimeRate: "18.75", holidayRate: "25.00" },
      rows: []
    };
  }

  function collectRowsFromTable(tbody) {
    return [...tbody.querySelectorAll("tr")].map(r => {
      const i = r.querySelectorAll("input");
      return {
        date: i[0]?.value || "",
        entry1: i[1]?.value || "",
        exit1: i[2]?.value || "",
        entry2: i[3]?.value || "",
        exit2: i[4]?.value || "",
        tipo: r.querySelector(".tipo")?.value || "normal",
        jornada: r.querySelector(".jornada")?.value || "8"
      };
    });
  }

  function loadFromStorage(storageKey, migrateFn) {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ok: true, state: createDefaultState(), source: "default" };

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Estado local inválido.", recoverable: true };
    }

    const migrated = migrateFn(parsed);
    if (!migrated) {
      return { ok: false, error: "Estado salvo incompatível.", recoverable: true };
    }

    return { ok: true, state: migrated, source: "storage" };
  }

  function saveToStorage(storageKey, state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  return { createDefaultState, collectRowsFromTable, loadFromStorage, saveToStorage };
});
