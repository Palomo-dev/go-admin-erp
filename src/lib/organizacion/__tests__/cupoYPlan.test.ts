/**
 * Cupo del plan y estado de la suscripción (Organización › Plan y facturación).
 * Lógica pura: los números vienen de `GET /api/me/plan`.
 */
import { cupoSucursales, cupoUsuarios, nivelUso, porcentajeUso, UMBRAL_ADVERTENCIA, UMBRAL_PELIGRO } from '../cupo';
import {
  accionesPlan,
  avancePrueba,
  cantidadValida,
  desgloseCompra,
  estadoPlan,
  motivoNoPermite,
  resultadoCompraEnUrl,
  tonoEstadoPlan,
} from '../plan';

describe('porcentajeUso y nivelUso', () => {
  test('sin tope (plan a medida) no hay porcentaje y el nivel es ilimitado', () => {
    expect(porcentajeUso(5, null)).toBeNull();
    expect(nivelUso(5, undefined)).toBe('ilimitado');
  });

  test('acota entre 0 y 100', () => {
    expect(porcentajeUso(12, 10)).toBe(100);
    expect(porcentajeUso(-3, 10)).toBe(0);
    expect(porcentajeUso(0, 0)).toBe(0);
    expect(porcentajeUso(1, 0)).toBe(100);
  });

  test('amarillo desde el 80 % y rojo desde el 95 % (Figma 08 · Uso del plan)', () => {
    expect(UMBRAL_ADVERTENCIA).toBe(80);
    expect(UMBRAL_PELIGRO).toBe(95);
    expect(nivelUso(7, 10)).toBe('normal');
    expect(nivelUso(8, 10)).toBe('advertencia');
    expect(nivelUso(94, 100)).toBe('advertencia');
    expect(nivelUso(95, 100)).toBe('peligro');
    expect(nivelUso(10, 10)).toBe('peligro');
  });
});

describe('cupoUsuarios', () => {
  test('suma los miembros activos y las invitaciones vigentes', () => {
    const c = cupoUsuarios(6, 2, 10);
    expect(c).toEqual({ usados: 8, maximo: 10, restantes: 2, lleno: false, nivel: 'advertencia' });
  });

  test('lleno cuando no cabe ni uno más', () => {
    expect(cupoUsuarios(9, 1, 10).lleno).toBe(true);
    expect(cupoUsuarios(11, 0, 10).restantes).toBe(0);
  });

  test('ilimitado nunca está lleno', () => {
    const c = cupoUsuarios(200, 5, null);
    expect(c.lleno).toBe(false);
    expect(c.restantes).toBeNull();
    expect(c.nivel).toBe('ilimitado');
  });

  test('un conteo negativo de invitaciones no resta', () => {
    expect(cupoUsuarios(3, -4, 10).usados).toBe(3);
  });
});

describe('cupoSucursales', () => {
  test('cuenta solo las activas que le pasan', () => {
    expect(cupoSucursales(6, 15)).toMatchObject({ usados: 6, restantes: 9, lleno: false });
    expect(cupoSucursales(1, 1).lleno).toBe(true);
  });
});

describe('estadoPlan', () => {
  test('sin plan', () => {
    expect(estadoPlan(null)).toBe('sinPlan');
    expect(estadoPlan({ estado: 'sin_plan' })).toBe('sinPlan');
  });

  test('prueba vigente, vencida y con cancelación programada', () => {
    expect(estadoPlan({ estado: 'prueba' })).toBe('prueba');
    expect(estadoPlan({ estado: 'prueba', pruebaVencida: true })).toBe('pruebaVencida');
    expect(estadoPlan({ estado: 'prueba', cancelaAlFinal: true })).toBe('cancelaAlFinal');
    // La prueba vencida manda aunque además se haya cancelado.
    expect(estadoPlan({ estado: 'prueba', pruebaVencida: true, cancelaAlFinal: true })).toBe('pruebaVencida');
  });

  test('activa, vencida y cancelada', () => {
    expect(estadoPlan({ estado: 'activo' })).toBe('activa');
    expect(estadoPlan({ estado: 'activo', cancelaAlFinal: true })).toBe('cancelaAlFinal');
    expect(estadoPlan({ estado: 'vencido' })).toBe('vencida');
    expect(estadoPlan({ estado: 'cancelado' })).toBe('cancelada');
  });

  test('tono del badge', () => {
    expect(tonoEstadoPlan('activa')).toBe('exito');
    expect(tonoEstadoPlan('vencida')).toBe('peligro');
    expect(tonoEstadoPlan('pruebaVencida')).toBe('advertencia');
    expect(tonoEstadoPlan('cancelada')).toBe('neutro');
  });
});

describe('accionesPlan', () => {
  test('una prueba se puede cancelar (P1-1)', () => {
    expect(accionesPlan('prueba', false).cancelar).toBe(true);
  });

  test('suscripción vencida: pagar, sin compras', () => {
    expect(accionesPlan('vencida', true)).toEqual({ primaria: 'pagar', cancelar: true, reactivar: false, comprar: false });
  });

  test('prueba vencida: elegir plan, sin cancelar ni comprar', () => {
    expect(accionesPlan('pruebaVencida', false)).toEqual({ primaria: 'elegirPlan', cancelar: false, reactivar: false, comprar: false });
  });

  test('reanudar una cancelación programada solo si hay Stripe', () => {
    expect(accionesPlan('cancelaAlFinal', true).reactivar).toBe(true);
    expect(accionesPlan('cancelaAlFinal', false).reactivar).toBe(false);
  });

  test('cancelada: renovar', () => {
    expect(accionesPlan('cancelada', true).primaria).toBe('renovar');
  });
});

describe('avancePrueba', () => {
  test('fracción de la prueba consumida', () => {
    expect(avancePrueba(10, 14)).toBeCloseTo(4 / 14);
    expect(avancePrueba(0, 14)).toBe(1);
    expect(avancePrueba(null, 14)).toBeNull();
    expect(avancePrueba(3, 0)).toBeNull();
  });
});

describe('compras', () => {
  test('el plan no lo permite', () => {
    expect(motivoNoPermite('usuarios', 'sinPlan', 10)).toBe('sinPlan');
    expect(motivoNoPermite('creditos', 'cancelada', null)).toBe('sinPlan');
    expect(motivoNoPermite('sucursales', 'vencida', 3)).toBe('planVencido');
    expect(motivoNoPermite('usuarios', 'pruebaVencida', 3)).toBe('planVencido');
    expect(motivoNoPermite('usuarios', 'activa', null)).toBe('ilimitado');
    // Los créditos de IA no tienen tope de cupo: se compran igual.
    expect(motivoNoPermite('creditos', 'activa', null)).toBeNull();
    expect(motivoNoPermite('usuarios', 'prueba', 5)).toBeNull();
  });

  test('desglose: cantidad × unitario', () => {
    expect(desgloseCompra(5, 300)).toEqual({ cantidad: 5, unitario: 300, total: 1500 });
    expect(desgloseCompra(5, null)).toEqual({ cantidad: 5, unitario: null, total: null });
    expect(desgloseCompra(2.5, 300).cantidad).toBe(0);
    expect(desgloseCompra(-1, 300).total).toBe(0);
  });

  test('cantidad válida', () => {
    expect(cantidadValida(1)).toBe(true);
    expect(cantidadValida(0)).toBe(false);
    expect(cantidadValida(1.5)).toBe(false);
    expect(cantidadValida(50, 100)).toBe(false);
    expect(cantidadValida(200, 100, 150)).toBe(false);
    expect(cantidadValida(120, 100, 150)).toBe(true);
  });

  test('regreso de la pasarela', () => {
    expect(resultadoCompraEnUrl(new URLSearchParams('addon=success'))).toEqual({ tipo: 'complemento', ok: true });
    expect(resultadoCompraEnUrl(new URLSearchParams('ai_credits=canceled'))).toEqual({ tipo: 'creditos', ok: false });
    expect(resultadoCompraEnUrl(new URLSearchParams('checkout=success'))).toEqual({ tipo: 'plan', ok: true });
    expect(resultadoCompraEnUrl(new URLSearchParams('addon=otra'))).toBeNull();
    expect(resultadoCompraEnUrl(new URLSearchParams(''))).toBeNull();
  });
});
