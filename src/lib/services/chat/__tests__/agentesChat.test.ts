import {
  agenteAsignado,
  cargoPuedeUsarChat,
  contarPorAgente,
  filtrarAgentes,
  leerMemberId,
  nombreCorto,
  nombrePersona,
  ordenarAgentes,
  type AgenteChat,
} from '../agentesChat';

const agente = (memberId: number, nombre: string, extra: Partial<AgenteChat> = {}): AgenteChat => ({
  memberId,
  userId: `u${memberId}`,
  nombre,
  avatarUrl: null,
  cargo: null,
  abiertas: 0,
  esYo: false,
  ...extra,
});

describe('Chat › asignación por nombre', () => {
  test('nombrePersona: nombre y apellido; si no, el correo; si no, null', () => {
    expect(nombrePersona({ first_name: 'Laura', last_name: 'Restrepo', email: 'l@x.test' })).toBe('Laura Restrepo');
    expect(nombrePersona({ first_name: '  ', last_name: null, email: 'l@x.test' })).toBe('l@x.test');
    expect(nombrePersona({})).toBeNull();
    expect(nombrePersona(null)).toBeNull();
  });

  test('nombreCorto: «Laura R.» para la fila de la lista', () => {
    expect(nombreCorto('Laura Restrepo')).toBe('Laura R.');
    expect(nombreCorto('juan pablo torres')).toBe('juan P.');
    expect(nombreCorto('Diana')).toBe('Diana');
  });

  test('cargoPuedeUsarChat: la misma regla del middleware', () => {
    const filas = new Map([
      ['ventas', [{ module_code: 'chat', can_view: true, can_access: true }]],
      ['bodega', [{ module_code: 'inventory', can_view: true, can_access: true }]],
      ['vacio', []],
    ]);
    expect(cargoPuedeUsarChat(null, filas)).toBe(true); // super admin o sin cargo
    expect(cargoPuedeUsarChat('ventas', filas)).toBe(true);
    expect(cargoPuedeUsarChat('bodega', filas)).toBe(false);
    expect(cargoPuedeUsarChat('vacio', filas)).toBe(true); // cargo sin filas no restringe
    expect(cargoPuedeUsarChat('desconocido', filas)).toBe(true);
    expect(cargoPuedeUsarChat('bodega', null)).toBe(true); // lectura fallida: fail open
  });

  test('contarPorAgente: carga abierta por persona', () => {
    const c = contarPorAgente([{ assigned_member_id: 1 }, { assigned_member_id: '1' }, { assigned_member_id: 2 }, { assigned_member_id: null }]);
    expect(c.get(1)).toBe(2);
    expect(c.get(2)).toBe(1);
    expect(c.has(0)).toBe(false);
  });

  test('ordenarAgentes: alfabético sin tildes y «tú» al final', () => {
    const lista = ordenarAgentes([agente(3, 'Ana Gómez', { esYo: true }), agente(2, 'Diana Castaño'), agente(1, 'Ángela Ruiz')]);
    expect(lista.map((a) => a.nombre)).toEqual(['Ángela Ruiz', 'Diana Castaño', 'Ana Gómez']);
  });

  test('filtrarAgentes: por nombre o cargo, sin tildes', () => {
    const lista = [agente(1, 'Diana Castaño', { cargo: 'Soporte' }), agente(2, 'Juan Pablo Torres', { cargo: 'Ventas' })];
    expect(filtrarAgentes(lista, 'castano').map((a) => a.memberId)).toEqual([1]);
    expect(filtrarAgentes(lista, 'VENTAS').map((a) => a.memberId)).toEqual([2]);
    expect(filtrarAgentes(lista, '  ')).toHaveLength(2);
  });

  test('agenteAsignado: nombre en vez de «Agente #id»; sin acceso → null', () => {
    const lista = [agente(7, 'Laura Restrepo')];
    expect(agenteAsignado(lista, 7)?.nombre).toBe('Laura Restrepo');
    expect(agenteAsignado(lista, '7')?.nombre).toBe('Laura Restrepo');
    expect(agenteAsignado(lista, 9)).toBeNull();
    expect(agenteAsignado(lista, null)).toBeNull();
  });

  test('leerMemberId: entero positivo, null para quitar, lo demás inválido', () => {
    expect(leerMemberId({ memberId: 5 })).toBe(5);
    expect(leerMemberId({ memberId: '5' })).toBe(5);
    expect(leerMemberId({ memberId: null })).toBeNull();
    expect(leerMemberId({ memberId: 0 })).toBeUndefined();
    expect(leerMemberId({ memberId: 1.5 })).toBeUndefined();
    expect(leerMemberId({ memberId: 'abc' })).toBeUndefined();
    expect(leerMemberId({})).toBeUndefined();
    expect(leerMemberId(null)).toBeUndefined();
  });
});
