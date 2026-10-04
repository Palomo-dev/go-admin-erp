import {
  confirmarDuplicados,
  paginaPares,
  type ClienteDuplicado,
  type GrupoDuplicado,
} from '../customerDuplicatesLogica';
const customer = (id: string, phone: string): ClienteDuplicado => ({
  id,
  phone,
  full_name: id,
  first_name: id,
  last_name: null,
  email: null,
  company_name: null,
  trade_name: null,
  identification_type: null,
  identification_number: null,
  address: null,
  city: null,
  conversations_count: 0,
  opportunities_count: 0,
});
const group = (customers: ClienteDuplicado[]): GrupoDuplicado => ({
  identity_type: 'phone',
  identity_value: '00000001',
  customers,
});
it('reutiliza E.164: nacional e internacional forman el mismo grupo', () => {
  const result = confirmarDuplicados(
    [
      group([
        customer('a', '+57 310 000 0001'),
        customer('b', '310 000 00 01'),
      ]),
    ],
    '57',
  );
  expect(result).toHaveLength(1);
  expect(result[0].identity_value).toBe('573100000001');
});
it('un sufijo igual en países distintos nunca confirma duplicidad', () => {
  expect(
    confirmarDuplicados(
      [group([customer('a', '+573100000001'), customer('b', '+523100000001')])],
      '57',
    ),
  ).toEqual([]);
});
it('no inventa indicativo para teléfonos inválidos', () => {
  expect(
    confirmarDuplicados(
      [group([customer('a', '4155550001'), customer('b', '+574155550001')])],
      '57',
    ),
  ).toEqual([]);
});
it('excluir A/B no oculta las coincidencias válidas A/C y B/C', () => {
  const result = paginaPares(
    [group(['a', 'b', 'c'].map((id) => customer(id, '+573100000001')))],
    [{ customer_a: 'a', customer_b: 'b' }],
    1,
  );
  expect(result.total).toBe(2);
  expect(result.data.map((g) => g.customers.map((c) => c.id))).toEqual([
    ['a', 'c'],
    ['b', 'c'],
  ]);
});
it('paginación y deduplicación de un par que coincide por teléfono y correo', () => {
  const g = group(['a', 'b', 'c'].map((id) => customer(id, '+573100000001')));
  const result = paginaPares([g, { ...g, identity_type: 'email' }], [], 2, 2);
  expect(result.total).toBe(3);
  expect(result.data).toHaveLength(1);
  expect(result.data[0].customers.map((c) => c.id)).toEqual(['b', 'c']);
});
