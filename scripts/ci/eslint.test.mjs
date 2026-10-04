import assert from 'node:assert/strict';
import test from 'node:test';
import { compararDiagnosticos } from './eslint.mjs';

const diagnostico = ({ raiz, fuente = 'const a = 1;', linea = 1, cantidad = 1 }) => [{
  filePath: `${raiz}/src/archivo.ts`,
  source: fuente,
  errorCount: cantidad,
  warningCount: 0,
  messages: Array.from({ length: cantidad }, () => ({
    ruleId: 'regla-de-prueba', severity: 2, message: 'Error de prueba', line: linea, column: 1,
  })),
}];

const base = diagnostico({ raiz: '/base' });
const comparar = (actual, anterior = base) => compararDiagnosticos(actual, anterior, '/actual', '/base');

test('mover código intacto no crea un error nuevo por cambiar su número de línea', () => {
  const resultado = comparar(diagnostico({ raiz: '/actual', fuente: '\nconst a = 1;', linea: 2 }));
  assert.equal(resultado.actual.errores, 1);
  assert.equal(resultado.erroresNuevos, 0);
  assert.equal(resultado.erroresResueltos, 0);
});

test('retirar un error no compensa otro nuevo en una declaración distinta', () => {
  const resultado = comparar(diagnostico({ raiz: '/actual', fuente: 'const b = 1;' }));
  assert.equal(resultado.actual.errores, resultado.base.errores);
  assert.equal(resultado.erroresNuevos, 1);
  assert.equal(resultado.erroresResueltos, 1);
  assert.equal(resultado.regresiones[0].fuente, 'const b = 1;');
});

test('un diagnóstico duplicado se cuenta aunque su texto ya existiera', () => {
  const resultado = comparar(diagnostico({ raiz: '/actual', cantidad: 2 }));
  assert.equal(resultado.erroresNuevos, 1);
  assert.equal(resultado.regresiones[0].cantidad, 1);
});

test('un JSON incompleto no puede servir como base ni como diagnóstico actual', () => {
  const incompleto = [{ filePath: '/actual/src/archivo.ts', errorCount: 0 }];
  assert.throws(() => comparar(incompleto), /diagnóstico de ESLint está incompleto/);
  assert.throws(() => comparar([], incompleto), /diagnóstico de ESLint está incompleto/);
  assert.throws(() => comparar(null), /diagnóstico de ESLint no es un arreglo/);
});

test('un conteo que no coincide con las apariciones impide acreditar el gate', () => {
  const incoherente = diagnostico({ raiz: '/actual' });
  incoherente[0].errorCount = 0;
  assert.throws(() => comparar(incoherente), /Conteo de errores incoherente/);
});

test('retirar todos los diagnósticos acredita la mejora sin inventar errores nuevos', () => {
  const resultado = comparar([]);
  assert.equal(resultado.actual.errores, 0);
  assert.equal(resultado.erroresNuevos, 0);
  assert.equal(resultado.erroresResueltos, 1);
  assert.deepEqual(resultado.regresiones, []);
});
