const test = require('node:test');
const assert = require('node:assert/strict');
const AppLogic = require('../app-logic.js');

test('calcula horas normais e extras em dia útil', () => {
  const worked = AppLogic.calculateWorkedHours({
    entry1: '08:00',
    exit1: '12:00',
    entry2: '13:00',
    exit2: '18:00',
    jornada: 8
  });

  assert.equal(worked.hours, 9);
  assert.equal(worked.normal, 8);
  assert.equal(worked.extra, 1);

  const pay = AppLogic.calculatePay({
    tipo: 'normal',
    hours: worked.hours,
    normal: worked.normal,
    extra: worked.extra,
    hourlyRate: 12.5,
    overtimeRate: 18.75,
    holidayRate: 25
  });

  assert.equal(pay, 118.75);
});

test('calcula pagamento de feriado com a taxa correta', () => {
  const worked = AppLogic.calculateWorkedHours({
    entry1: '09:00',
    exit1: '12:00',
    entry2: '13:00',
    exit2: '15:00',
    jornada: 8
  });

  const pay = AppLogic.calculatePay({
    tipo: 'holiday',
    hours: worked.hours,
    normal: worked.normal,
    extra: worked.extra,
    hourlyRate: 12.5,
    overtimeRate: 18.75,
    holidayRate: 25
  });

  assert.equal(worked.hours, 5);
  assert.equal(pay, 125);
});

test('faz parse de moeda BRL exibida na tabela', () => {
  assert.equal(AppLogic.parseCurrencyBRL('R$ 1.234,56'), 1234.56);
  assert.equal(AppLogic.parseCurrencyBRL('R$ 0,00'), 0);
});

test('parseTime retorna null para formato inválido', () => {
  assert.equal(AppLogic.parseTime('aa:bb'), null);
  assert.equal(AppLogic.parseTime(''), null);
});

test('calcula jornada que atravessa meia-noite', () => {
  const worked = AppLogic.calculateWorkedHours({
    entry1: '22:00',
    exit1: '02:00',
    entry2: '',
    exit2: '',
    jornada: 8
  });

  assert.equal(worked.hours, 4);
  assert.equal(worked.normal, 4);
  assert.equal(worked.extra, 0);
});

test('diffMinutes trata virada de dia corretamente', () => {
  assert.equal(AppLogic.diffMinutes(1380, 120), 180);
  assert.equal(AppLogic.diffMinutes(480, 600), 120);
});


test('parseCurrencyBRL lida com espaços e conteúdo inválido', () => {
  assert.equal(AppLogic.parseCurrencyBRL('R$  2.000,10'), 2000.10);
  assert.equal(AppLogic.parseCurrencyBRL('invalido'), 0);
});
