/**
 * Convención única del signo: saldo en libros - saldo del extracto (Figma «Mapa /
 * Signo de la diferencia»). La misma de la columna generada `difference`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  aNumero,
  diferenciaConciliacion,
  errorCierre,
  importeItem,
  planCierre,
  saldoEnLibros,
  sentidoDiferencia,
  totalConciliado,
} from '../diferencia';

const item = (amount: number, movimiento?: number, is_matched = true) => ({
  amount,
  is_matched,
  bank_transactions: movimiento === undefined ? null : { amount: movimiento },
});

describe('el signo de la diferencia', () => {
  it.each([
    [100, 100, 0, 'sinDiferencia'],
    [120, 100, 20, 'librosMayor'],
    [100, 120, -20, 'extractoMayor'],
  ])('libros %d y extracto %d da %d', (libros, extracto, esperado, sentido) => {
    const diferencia = diferenciaConciliacion(libros, extracto);
    expect(diferencia).toBe(esperado);
    expect(sentidoDiferencia(diferencia as number)).toBe(sentido);
  });

  it('sin saldo del extracto la diferencia se desconoce, no es cero', () => {
    expect(diferenciaConciliacion(100, null)).toBeNull();
  });

  it('un saldo del extracto en cero es un dato', () => {
    expect(aNumero(0)).toBe(0);
    expect(aNumero('0')).toBe(0);
    expect(aNumero(null)).toBeNull();
    expect(diferenciaConciliacion(50, 0)).toBe(50);
  });

  it('medio centavo no es diferencia', () => {
    expect(sentidoDiferencia(0.004)).toBe('sinDiferencia');
    expect(sentidoDiferencia(-0.004)).toBe('sinDiferencia');
    expect(sentidoDiferencia(0.005)).toBe('librosMayor');
  });
});

describe('el saldo en libros', () => {
  it('un retiro conciliado desde el extracto resta aunque el item guarde abs(valor)', () => {
    expect(importeItem(item(100, -100))).toBe(-100);
    expect(saldoEnLibros(1000, [item(300, 300), item(100, -100)])).toBe(1200);
  });

  it('sin movimiento vale el importe del item', () => {
    expect(importeItem(item(70))).toBe(70);
  });

  it('solo cuenta lo conciliado', () => {
    expect(totalConciliado([item(50, 50), item(30, 30, false)])).toBe(50);
  });

  it('los importes de PostgREST pueden llegar como texto', () => {
    expect(importeItem({ amount: 10, is_matched: true, bank_transactions: { amount: '-10.50' } })).toBe(-10.5);
  });
});

describe('el plan de cierre', () => {
  it('sin diferencia no pide motivo ni crea partida', () => {
    expect(planCierre(100, 100, 0)).toMatchObject({ exigeMotivo: false, creaPartida: false });
  });

  it('con diferencia pide motivo y la deja como partida con su signo', () => {
    expect(planCierre(100, 340, 0)).toEqual({ diferencia: -240, partidaNueva: -240, exigeMotivo: true, creaPartida: true });
  });

  it('una diferencia explicada por partidas traídas pide motivo y no crea otra', () => {
    expect(planCierre(100, 340, -240)).toMatchObject({ partidaNueva: 0, exigeMotivo: true, creaPartida: false });
  });

  it('solo nace lo que las traídas no explican', () => {
    expect(planCierre(100, 400, -240)).toMatchObject({ diferencia: -300, partidaNueva: -60, creaPartida: true });
  });

  it('con libros iguales al extracto y una traída viva, la partida la compensa', () => {
    expect(planCierre(100, 100, -240)).toMatchObject({ diferencia: 0, partidaNueva: 240, exigeMotivo: true, creaPartida: true });
  });
});

describe('los errores de la RPC', () => {
  it('reconoce el código dentro del mensaje', () => {
    expect(errorCierre({ message: 'motivo_obligatorio' })).toBe('motivo_obligatorio');
    expect(errorCierre({ message: 'algo raro' })).toBe('desconocido');
    expect(errorCierre(null)).toBe('desconocido');
  });
});

describe('nadie escribe la columna generada', () => {
  const raiz = process.cwd();
  it.each([
    'src/components/finanzas/bancos/BancosService.ts',
    'src/components/finanzas/conciliacion-bancaria/ConciliacionService.ts',
    'src/components/finanzas/conciliacion-bancaria/NuevaConciliacionForm.tsx',
    'src/components/finanzas/conciliacion-bancaria/ConciliacionDetailPage.tsx',
  ])('%s', (ruta) => {
    const fuente = readFileSync(join(raiz, ruta), 'utf8');
    // `difference: 0` en el INSERT hacía fallar toda creación (428C9).
    expect(fuente).not.toMatch(/\bdifference:\s*\d/);
    expect(fuente).not.toMatch(/closing_balance:\s*[^,\n]*(matched|opening)/i);
  });

  it('el cierre va por la RPC, no por un update de status', () => {
    const fuente = readFileSync(join(raiz, 'src/components/finanzas/bancos/BancosService.ts'), 'utf8');
    expect(fuente).toContain("rpc('fn_conciliacion_cerrar'");
    expect(fuente).not.toMatch(/status:\s*'closed'/);
  });
});
