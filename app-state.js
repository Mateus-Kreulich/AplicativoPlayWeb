(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.AppState = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BACKUP_SUFFIX = "::backup";

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

  function parseAndMigrate(raw, migrateFn) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    try {
      return migrateFn(parsed);
    } catch {
      return null;
    }
  }

  function getBackupKey(storageKey) {
    return `${storageKey}${BACKUP_SUFFIX}`;
  }

  function loadFromStorage(storageKey, migrateFn) {
    const backupKey = getBackupKey(storageKey);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ok: true, state: createDefaultState(), source: "default" };

    const migrated = parseAndMigrate(raw, migrateFn);
    if (migrated) {
      const backupRaw = localStorage.getItem(backupKey);
      const backupMigrated = backupRaw ? parseAndMigrate(backupRaw, migrateFn) : null;
      if (!backupMigrated) {
        localStorage.setItem(backupKey, raw);
      }
      return { ok: true, state: migrated, source: "storage" };
    }

    const backupRaw = localStorage.getItem(backupKey);
    if (backupRaw) {
      const backupMigrated = parseAndMigrate(backupRaw, migrateFn);
      if (backupMigrated) {
        return {
          ok: true,
          state: backupMigrated,
          source: "backup",
          warning: "Estado principal inválido, backup restaurado automaticamente."
        };
      }
    }

    return { ok: false, error: "Estado local inválido.", recoverable: true };
  }

  function saveToStorage(storageKey, state) {
    const payload = JSON.stringify(state);
    const backupKey = getBackupKey(storageKey);

    localStorage.setItem(storageKey, payload);
    localStorage.setItem(backupKey, payload);
  }

  return { createDefaultState, collectRowsFromTable, loadFromStorage, saveToStorage, getBackupKey };
});
