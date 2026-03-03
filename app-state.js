(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.AppState = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BACKUP_SUFFIX = "::backup";
  const CURRENT_STATE_VERSION = 3;

  function normalizeText(value, fallback = "") {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return normalized || fallback;
  }

  function normalizeRate(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value.toFixed(2);
    }

    if (typeof value === "string") {
      const normalized = value.trim().replace(",", ".");
      if (!normalized) return fallback;
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return parsed.toFixed(2);
      }
      return normalized;
    }

    return fallback;
  }

  function normalizeRow(row) {
    return {
      date: normalizeText(row?.date),
      entry1: normalizeText(row?.entry1),
      exit1: normalizeText(row?.exit1),
      entry2: normalizeText(row?.entry2),
      exit2: normalizeText(row?.exit2),
      tipo: normalizeText(row?.tipo, "normal"),
      jornada: normalizeText(row?.jornada, "8")
    };
  }

  function isPersistableRow(row) {
    return row.date || row.entry1 || row.exit1 || row.entry2 || row.exit2;
  }

  function prepareStateForStorage(state) {
    const incoming = state && typeof state === "object" ? state : {};
    const meta = incoming.meta && typeof incoming.meta === "object" ? incoming.meta : {};

    return {
      version: Number.isInteger(incoming.version) ? incoming.version : CURRENT_STATE_VERSION,
      settings: {
        hourlyRate: normalizeRate(incoming.settings?.hourlyRate, "12.50"),
        overtimeRate: normalizeRate(incoming.settings?.overtimeRate, "18.75"),
        holidayRate: normalizeRate(incoming.settings?.holidayRate, "25.00")
      },
      rows: (Array.isArray(incoming.rows) ? incoming.rows : [])
        .map(normalizeRow)
        .filter(isPersistableRow),
      meta: {
        ...meta,
        lastSavedAt: new Date().toISOString()
      }
    };
  }

  function createDefaultState() {
    return {
      version: CURRENT_STATE_VERSION,
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
    if (!raw) {
      return { ok: true, state: createDefaultState(), source: "default" };
    }

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
    const payload = JSON.stringify(prepareStateForStorage(state));
    const backupKey = getBackupKey(storageKey);

    try {
      localStorage.setItem(backupKey, payload);
      localStorage.setItem(storageKey, payload);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: "Falha ao persistir estado local." };
    }
  }

  return {
    createDefaultState,
    collectRowsFromTable,
    loadFromStorage,
    saveToStorage,
    getBackupKey,
    prepareStateForStorage
  };
});
