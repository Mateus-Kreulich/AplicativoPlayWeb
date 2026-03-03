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

  const saved = JSON.parse(storage.getItem('k'));
  const backup = JSON.parse(storage.getItem('k::backup'));

  assert.equal(saved.version, 3);
  assert.deepEqual(saved.settings, { hourlyRate: '10.00', overtimeRate: '20.00', holidayRate: '30.00' });
  assert.deepEqual(saved.rows, []);
  assert.match(saved.meta.lastSavedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(saved, backup);
});





test('saveToStorage normaliza taxas com vírgula e fallback numérico', () => {
  const storage = createStorage();
  global.localStorage = storage;

  const state = {
    version: 3,
    settings: { hourlyRate: ' 12,5 ', overtimeRate: 'abc', holidayRate: null },
    rows: []
  };

  AppState.saveToStorage('k', state);
  const saved = JSON.parse(storage.getItem('k'));

  assert.equal(saved.settings.hourlyRate, '12.50');
  assert.equal(saved.settings.overtimeRate, 'abc');
  assert.equal(saved.settings.holidayRate, '25.00');
});

test('saveToStorage normaliza campos e remove linhas vazias', () => {
  const storage = createStorage();
  global.localStorage = storage;

  const state = {
    version: 3,
    settings: { hourlyRate: ' 15.00 ', overtimeRate: 27.5, holidayRate: '' },
    rows: [
      { date: '', entry1: ' ', exit1: '', entry2: '', exit2: '', tipo: '', jornada: '' },
      { date: '2026-05-10 ', entry1: '08:00', exit1: '', entry2: '', exit2: '', tipo: ' extra ', jornada: ' 12 ' }
    ]
  };

  AppState.saveToStorage('k', state);
  const saved = JSON.parse(storage.getItem('k'));

  assert.equal(saved.settings.hourlyRate, '15.00');
  assert.equal(saved.settings.overtimeRate, '27.50');
  assert.equal(saved.settings.holidayRate, '25.00');
  assert.equal(saved.rows.length, 1);
  assert.equal(saved.rows[0].date, '2026-05-10');
  assert.equal(saved.rows[0].tipo, 'extra');
  assert.equal(saved.rows[0].jornada, '12');
  assert.match(saved.meta.lastSavedAt, /^\d{4}-\d{2}-\d{2}T/);
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
