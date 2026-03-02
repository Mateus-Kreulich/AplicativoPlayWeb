const test = require('node:test');
const assert = require('node:assert/strict');
const StateSchema = require('../state-schema.js');

test('migra estado v1 para versão atual com defaults', () => {
  const migrated = StateSchema.migrateState({
    settings: { hourlyRate: '15.00' },
    rows: [{ date: '2026-01-01', entry1: '08:00', exit1: '12:00' }]
  });

  assert.equal(migrated.version, StateSchema.CURRENT_VERSION);
  assert.equal(migrated.settings.hourlyRate, '15.00');
  assert.equal(migrated.settings.overtimeRate, '18.75');
  assert.equal(migrated.rows[0].tipo, 'normal');
});

test('rejeita versão futura não suportada', () => {
  const migrated = StateSchema.migrateState({ version: 999, settings: {}, rows: [] });
  assert.equal(migrated, null);
});


test('normaliza linhas incompletas durante migração', () => {
  const migrated = StateSchema.migrateState({
    version: 1,
    settings: {},
    rows: [{ date: '2026-02-01' }]
  });

  assert.equal(migrated.rows[0].entry1, '');
  assert.equal(migrated.rows[0].tipo, 'normal');
  assert.equal(migrated.rows[0].jornada, '8');
});


test('migra explicitamente de v2 para v3', () => {
  const migrated = StateSchema.migrateState({
    version: 2,
    settings: { hourlyRate: '20.00' },
    rows: []
  });

  assert.equal(migrated.version, 3);
  assert.equal(migrated.settings.hourlyRate, '20.00');
});


test('preserva metadados úteis após migração', () => {
  const migrated = StateSchema.migrateState({
    version: 2,
    settings: {},
    rows: [],
    meta: { source: 'legacy-import' }
  });

  assert.equal(migrated.meta.source, 'legacy-import');
});
