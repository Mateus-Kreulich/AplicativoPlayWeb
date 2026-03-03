const test = require('node:test');
const assert = require('node:assert/strict');
const AppState = require('../app-state.js');

function createStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test('saveToStorage grava estado principal e backup', () => {
  const storage = createStorage();
  global.localStorage = storage;

  const state = { version: 3, settings: { hourlyRate: '10', overtimeRate: '20', holidayRate: '30' }, rows: [] };
  AppState.saveToStorage('k', state);

  assert.equal(storage.getItem('k'), JSON.stringify(state));
  assert.equal(storage.getItem('k::backup'), JSON.stringify(state));
});

test('loadFromStorage recupera backup quando estado principal está inválido', () => {
  const storage = createStorage();
  global.localStorage = storage;

  storage.setItem('k', '{invalid');
  storage.setItem('k::backup', JSON.stringify({ version: 3, settings: {}, rows: [{ date: '2026-01-01' }] }));

  const migrated = AppState.loadFromStorage('k', (state) => ({ ...state, restored: true }));

  assert.equal(migrated.ok, true);
  assert.equal(migrated.source, 'backup');
  assert.equal(migrated.state.restored, true);
});

test('loadFromStorage repara backup ausente quando estado principal está válido', () => {
  const storage = createStorage();
  global.localStorage = storage;

  const raw = JSON.stringify({ version: 3, settings: { hourlyRate: '10' }, rows: [] });
  storage.setItem('k', raw);

  const migrated = AppState.loadFromStorage('k', (state) => state);

  assert.equal(migrated.ok, true);
  assert.equal(migrated.source, 'storage');
  assert.equal(storage.getItem('k::backup'), raw);
});


test('getBackupKey retorna sufixo padrão de backup', () => {
  assert.equal(AppState.getBackupKey('controle'), 'controle::backup');
});
