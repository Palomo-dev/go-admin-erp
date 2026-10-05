import { filtroDeIdsSegmento, leerCsvMiembrosSegmento } from '../segmentosImportacionLogica';
import { normalizarFiltroSegmento } from '../segmentosLogica';
import { U } from '@/app/api/crm/__tests__/ola1Fake';
test('CSV con BOM y columnas adicionales produce los IDs, sin interpretar fórmulas', () => {
  expect(leerCsvMiembrosSegmento(`\uFEFFcustomer_id;name\r\n${U(1)};"Fixture; nombre"\r\n${U(2)};Otro`)).toEqual([U(1), U(2)]);
  expect(() => leerCsvMiembrosSegmento('customer_id\n=CMD()')).toThrow();
});
test('5000 miembros usan el DSL compartido dentro de sus límites', () => {
  const filter = filtroDeIdsSegmento(Array.from({ length: 5000 }, (_, i) => U(i + 1)));
  expect(normalizarFiltroSegmento(filter).rules).toHaveLength(50);
});
test('CSV de una sola columna con más de mil clientes es válido', () => {
  const ids = Array.from({ length: 1206 }, (_, i) => U(i + 1));
  expect(leerCsvMiembrosSegmento(`customer_id\n${ids.join('\n')}`)).toEqual(ids);
});
test.each([`customer_id\n${U(1)}\n${U(1)}`, 'name\nFixture', 'customer_id\n', 'customer_id\nno-uuid'])('rechaza duplicados, cabecera ausente y datos inválidos', text => {
  expect(() => leerCsvMiembrosSegmento(text)).toThrow();
});
