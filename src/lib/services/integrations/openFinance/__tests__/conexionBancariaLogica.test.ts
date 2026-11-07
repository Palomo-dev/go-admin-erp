/**
 * Conectar banco (Finanzas r2 · A3–A6): regla de renovar (7 días o menos),
 * estados de autorizaciones y de cuentas conectadas, cifras.
 */
import {
  DIAS_PARA_RENOVAR,
  bancosConFallo,
  cifrasConexion,
  diasParaVencer,
  estadoAutorizacion,
  filasCuentasConectadas,
  numeroCorto,
  puedeRenovar,
  puedeRevocar,
  ultimaSincronizacion,
  type CuentaBanco,
  type LinkBanco,
} from '../conexionBancariaLogica';

const AHORA = new Date('2026-11-07T15:00:00Z');
const enDias = (d: number, horas = 0) => new Date(AHORA.getTime() + d * 86_400_000 + horas * 3_600_000).toISOString();

describe('renovar solo si vence en 7 días o menos', () => {
  it('la ventana es de 7 días', () => {
    expect(DIAS_PARA_RENOVAR).toBe(7);
  });

  it('vence en 5 días: «Por vencer», se renueva y se revoca', () => {
    const a = { status: 'active', expires_at: enDias(5) };
    expect(diasParaVencer(a.expires_at, AHORA)).toBe(5);
    expect(estadoAutorizacion(a, AHORA)).toBe('porVencer');
    expect(puedeRenovar(a, AHORA)).toBe(true);
    expect(puedeRevocar(a, AHORA)).toBe(true);
  });

  it('justo 7 días: se renueva; 7 días y una hora: todavía no', () => {
    expect(puedeRenovar({ status: 'active', expires_at: enDias(7) }, AHORA)).toBe(true);
    expect(puedeRenovar({ status: 'active', expires_at: enDias(7, 1) }, AHORA)).toBe(false);
  });

  it('vence en 30 días: «Activa», solo revocar', () => {
    const a = { status: 'active', expires_at: enDias(30) };
    expect(estadoAutorizacion(a, AHORA)).toBe('activa');
    expect(puedeRenovar(a, AHORA)).toBe(false);
    expect(puedeRevocar(a, AHORA)).toBe(true);
  });

  it('ya venció (aunque la BD aún diga active): ni renovar ni revocar', () => {
    const a = { status: 'active', expires_at: enDias(-1) };
    expect(estadoAutorizacion(a, AHORA)).toBe('vencida');
    expect(puedeRenovar(a, AHORA)).toBe(false);
    expect(puedeRevocar(a, AHORA)).toBe(false);
  });

  it('revocada o vencida en la BD no se renueva aunque esté en la ventana', () => {
    expect(puedeRenovar({ status: 'revoked', expires_at: enDias(3) }, AHORA)).toBe(false);
    expect(estadoAutorizacion({ status: 'revoked', expires_at: enDias(3) }, AHORA)).toBe('revocada');
    expect(puedeRenovar({ status: 'expired', expires_at: enDias(3) }, AHORA)).toBe(false);
  });

  it('sin vencimiento: activa, no se renueva', () => {
    expect(diasParaVencer(null, AHORA)).toBeNull();
    expect(estadoAutorizacion({ status: 'active', expires_at: null }, AHORA)).toBe('activa');
    expect(puedeRenovar({ status: 'active', expires_at: null }, AHORA)).toBe(false);
  });
});

describe('cuentas conectadas', () => {
  const links: LinkBanco[] = [
    { id: 'l1', institution_name: 'Banco A', status: 'active', last_sync_at: '2026-11-07T11:00:00Z' },
    { id: 'l2', institution_name: 'Banco B', status: 'error', last_sync_at: '2026-11-06T11:00:00Z' },
    { id: 'l3', institution_name: 'Banco C', status: 'revoked', last_sync_at: '2026-11-08T11:00:00Z' },
  ];
  const cuenta = (id: string, link_id: string, bank_account_id: number | null, extra: Partial<CuentaBanco> = {}): CuentaBanco => ({
    id,
    link_id,
    bank_account_id,
    account_number: '000111224321',
    account_type: 'savings',
    currency: 'COP',
    is_active: true,
    last_balance: 1000,
    last_balance_at: null,
    ...extra,
  });
  const cuentas = [
    cuenta('a1', 'l1', 7),
    cuenta('a2', 'l1', null, { account_number: '45', account_type: 'checking' }),
    cuenta('b1', 'l2', 8),
    cuenta('c1', 'l3', 9),
    cuenta('a3', 'l1', 10, { is_active: false }),
  ];

  it('estado por fila: activa, sin vincular y falló (el fallo manda)', () => {
    const filas = filasCuentasConectadas(links, cuentas, [{ id: 7, name: 'Banco A', account_number: '4321', account_code: '11100501' }]);
    expect(filas.map((f) => [f.id, f.estado])).toEqual([
      ['a2', 'sinVincular'],
      ['a1', 'activa'],
      ['b1', 'fallo'],
    ]);
    expect(filas.find((f) => f.id === 'a1')?.cuentaGo).toEqual({ nombre: 'Banco A', numeroCorto: '··4321', codigo: '11100501' });
    expect(filas.find((f) => f.id === 'a2')?.numeroCorto).toBeNull();
  });

  it('cifras, fallos y última sincronización ignoran lo revocado', () => {
    const filas = filasCuentasConectadas(links, cuentas, []);
    expect(cifrasConexion(links, filas)).toEqual({ bancosConectados: 2, cuentasVinculadas: 2 });
    expect(bancosConFallo(links)).toEqual(['Banco B']);
    expect(ultimaSincronizacion(links)).toBe('2026-11-07T11:00:00Z');
    expect(ultimaSincronizacion([])).toBeNull();
  });

  it('número corto', () => {
    expect(numeroCorto('0001 1122 4321')).toBe('··4321');
    expect(numeroCorto('12')).toBeNull();
    expect(numeroCorto(null)).toBeNull();
  });
});
