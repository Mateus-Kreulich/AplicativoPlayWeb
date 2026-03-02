(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.StateSchema = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CURRENT_VERSION = 3;

  function normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      date: r?.date || "",
      entry1: r?.entry1 || "",
      exit1: r?.exit1 || "",
      entry2: r?.entry2 || "",
      exit2: r?.exit2 || "",
      tipo: r?.tipo || "normal",
      jornada: r?.jornada || "8"
    }));
  }

  function normalizeSettings(settings) {
    return {
      hourlyRate: settings?.hourlyRate ?? "12.50",
      overtimeRate: settings?.overtimeRate ?? "18.75",
      holidayRate: settings?.holidayRate ?? "25.00"
    };
  }

  function migrateV1ToV2(state) {
    return {
      version: 2,
      settings: normalizeSettings(state.settings),
      rows: normalizeRows(state.rows)
    };
  }

  function migrateV2ToV3(state) {
    return {
      version: 3,
      settings: normalizeSettings(state.settings),
      rows: normalizeRows(state.rows),
      meta: {
        ...(state.meta || {}),
        migratedAt: (state.meta && state.meta.migratedAt) || new Date().toISOString()
      }
    };
  }

  function stripToSupportedShape(state) {
    return {
      version: CURRENT_VERSION,
      settings: normalizeSettings(state.settings),
      rows: normalizeRows(state.rows),
      meta: state.meta || null
    };
  }

  function migrateState(state) {
    if (!state || typeof state !== "object") return null;

    let working = { ...state };
    const initialVersion = Number.isInteger(working.version) ? working.version : 1;
    working.version = initialVersion;

    if (working.version === 1) working = migrateV1ToV2(working);
    if (working.version === 2) working = migrateV2ToV3(working);

    if (working.version !== CURRENT_VERSION) return null;

    return stripToSupportedShape(working);
  }

  return {
    CURRENT_VERSION,
    migrateState,
    migrateV1ToV2,
    migrateV2ToV3
  };
});
