const test = require('node:test');
const assert = require('node:assert/strict');
const UiUtils = require('../ui-utils.js');

test('rowsToCsv gera CSV válido com escaping', () => {
  const csv = UiUtils.rowsToCsv(['A', 'B'], [['1', 'texto;com;ponto'], ['2', '"aspas"']]);
  assert.ok(csv.includes('"A";"B"'));
  assert.ok(csv.includes('"2";"""aspas"""'));
});


test('rowsToCsv aceita separador customizado', () => {
  const csv = UiUtils.rowsToCsv(['A', 'B'], [['1', '2']], ',');
  assert.equal(csv.split('\n')[0], '"A","B"');
});


test('parseImportJson valida json e estrutura migrável', () => {
  const ok = UiUtils.parseImportJson('{"version":1,"settings":{},"rows":[]}', (obj) => ({ ...obj, version: 3 }));
  assert.equal(ok.ok, true);
  assert.equal(ok.state.version, 3);

  const badJson = UiUtils.parseImportJson('{not-json}', () => ({}));
  assert.equal(badJson.ok, false);

  const badSchema = UiUtils.parseImportJson('{"a":1}', () => null);
  assert.equal(badSchema.ok, false);
});

test('buildReportHtml inclui metadados e tabela', () => {
  const html = UiUtils.buildReportHtml({
    title: 'Relatório',
    generatedAt: '01/01/2026 10:00',
    tableHtml: '<table><tr><td>ok</td></tr></table>',
    totalsHtml: '<p>Totais</p>'
  });

  assert.ok(html.includes('Relatório'));
  assert.ok(html.includes('Gerado em: 01/01/2026 10:00'));
  assert.ok(html.includes('<table><tr><td>ok</td></tr></table>'));
  assert.ok(html.includes('<p>Totais</p>'));
});
