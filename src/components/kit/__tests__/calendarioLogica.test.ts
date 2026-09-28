/**
 * Lógica del calendario de marca (Figma `DateRange` 104:3343): grilla,
 * idioma, teclado y límites, todo con días calendario puros.
 */
import {
  acotarDia,
  diasDeSemana,
  elegirEnRango,
  etiquetaDiaCompleta,
  etiquetaDiaCorta,
  etiquetaDiaTrigger,
  fueraDeLimites,
  grillaMes,
  mesFueraDeLimites,
  moverFoco,
  nombreMes,
  primerDiaDeSemana,
  sumarMeses,
  sumarMesesDia,
} from '../calendarioLogica';

describe('primer día de la semana según el idioma', () => {
  it('lunes en español y francés; domingo en inglés y portugués', () => {
    expect(primerDiaDeSemana('es')).toBe(1);
    expect(primerDiaDeSemana('es-CO')).toBe(1);
    expect(primerDiaDeSemana('fr-FR')).toBe(1);
    expect(primerDiaDeSemana('en-US')).toBe(0);
    expect(primerDiaDeSemana('pt-BR')).toBe(0);
  });
});

describe('cabecera de la grilla', () => {
  it('español: las iniciales de Figma (miércoles = X)', () => {
    expect(diasDeSemana('es-CO').map((d) => d.corto).join(' ')).toBe('L M X J V S D');
    expect(diasDeSemana('es-CO')[0].largo).toBe('lunes');
  });
  it('inglés empieza en domingo', () => {
    expect(diasDeSemana('en-US').map((d) => d.corto).join(' ')).toBe('S M T W T F S');
  });
});

describe('grillaMes', () => {
  it('septiembre 2026 con lunes primero: 42 celdas desde el 31 de agosto', () => {
    const g = grillaMes('2026-09', 1);
    expect(g).toHaveLength(42);
    expect(g[0]).toEqual({ dia: '2026-08-31', numero: 31, delMes: false });
    expect(g[1]).toEqual({ dia: '2026-09-01', numero: 1, delMes: true });
    expect(g[30].dia).toBe('2026-09-30');
    expect(g[41]).toEqual({ dia: '2026-10-11', numero: 11, delMes: false });
  });
  it('con domingo primero arranca el 30 de agosto', () => {
    expect(grillaMes('2026-09', 0)[0].dia).toBe('2026-08-30');
  });
  it('un mes que empieza en el primer día no deja celdas del mes anterior', () => {
    // 1 de junio de 2026 fue lunes.
    expect(grillaMes('2026-06', 1)[0].dia).toBe('2026-06-01');
  });
});

describe('meses', () => {
  it('suma y resta meses cruzando años', () => {
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
    expect(sumarMeses('2026-09', -21)).toBe('2024-12');
  });
  it('el día se acorta al último del mes destino', () => {
    expect(sumarMesesDia('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMesesDia('2028-01-31', 1)).toBe('2028-02-29');
    expect(sumarMesesDia('2026-03-31', -1)).toBe('2026-02-28');
  });
  it('nombre del mes con mayúscula inicial en los 4 idiomas', () => {
    expect(nombreMes('2026-09', 'es-CO')).toBe('Septiembre 2026');
    expect(nombreMes('2026-09', 'en-US')).toBe('September 2026');
    expect(nombreMes('2026-09', 'fr-FR')).toBe('Septembre 2026');
    expect(nombreMes('2026-09', 'pt-BR')).toBe('Setembro 2026');
  });
});

describe('textos de un día', () => {
  it('disparador: formato de Figma en español, Intl en otro idioma', () => {
    expect(etiquetaDiaTrigger('2026-09-01', 'es-CO')).toBe('1 sep 2026');
    expect(etiquetaDiaTrigger('2026-09-01', 'en-US')).toBe('Sep 1, 2026');
  });
  it('nombre completo y corto sin correrse de día', () => {
    expect(etiquetaDiaCompleta('2026-09-28', 'es-CO')).toBe('lunes, 28 de septiembre de 2026');
    expect(etiquetaDiaCorta('2026-09-01', 'es-CO')).toBe('1 sep');
  });
});

describe('teclado (patrón date picker de WAI-ARIA)', () => {
  it('flechas mueven un día o una semana, cruzando meses', () => {
    expect(moverFoco('2026-09-30', 'ArrowRight', 1)).toBe('2026-10-01');
    expect(moverFoco('2026-09-01', 'ArrowLeft', 1)).toBe('2026-08-31');
    expect(moverFoco('2026-09-28', 'ArrowDown', 1)).toBe('2026-10-05');
    expect(moverFoco('2026-09-03', 'ArrowUp', 1)).toBe('2026-08-27');
  });
  it('Inicio y Fin van al borde de la semana del idioma', () => {
    // 2026-09-30 es miércoles.
    expect(moverFoco('2026-09-30', 'Home', 1)).toBe('2026-09-28');
    expect(moverFoco('2026-09-30', 'End', 1)).toBe('2026-10-04');
    expect(moverFoco('2026-09-30', 'Home', 0)).toBe('2026-09-27');
    expect(moverFoco('2026-09-30', 'End', 0)).toBe('2026-10-03');
  });
  it('RePág/AvPág mueven un mes; con Mayús, un año', () => {
    expect(moverFoco('2026-03-31', 'PageUp', 1)).toBe('2026-02-28');
    expect(moverFoco('2026-09-15', 'PageDown', 1)).toBe('2026-10-15');
    expect(moverFoco('2026-09-15', 'PageDown', 1, true)).toBe('2027-09-15');
  });
  it('otra tecla no mueve el foco', () => {
    expect(moverFoco('2026-09-15', 'a', 1)).toBeNull();
  });
});

describe('límites', () => {
  it('min y max incluyen los extremos; vacíos no limitan', () => {
    expect(fueraDeLimites('2026-09-10', '2026-09-10', '2026-09-20')).toBe(false);
    expect(fueraDeLimites('2026-09-09', '2026-09-10', null)).toBe(true);
    expect(fueraDeLimites('2026-09-21', '', '2026-09-20')).toBe(true);
    expect(fueraDeLimites('2026-09-21', '', '')).toBe(false);
  });
  it('acotarDia y meses fuera de límite', () => {
    expect(acotarDia('2026-01-01', '2026-09-10', null)).toBe('2026-09-10');
    expect(acotarDia('2027-01-01', null, '2026-09-28')).toBe('2026-09-28');
    expect(mesFueraDeLimites('2026-10', null, '2026-09-28')).toBe(true);
    expect(mesFueraDeLimites('2026-08', '2026-08-31', null)).toBe(false);
    expect(mesFueraDeLimites('2026-07', '2026-08-01', null)).toBe(true);
  });
});

describe('elegirEnRango (dos clics)', () => {
  it('el primer clic ancla y el segundo cierra en orden', () => {
    const a = elegirEnRango(null, '2026-09-21');
    expect(a).toEqual({ ancla: '2026-09-21', desde: '2026-09-21', hasta: '2026-09-21', completo: false });
    expect(elegirEnRango(a.ancla, '2026-09-01')).toEqual({ ancla: null, desde: '2026-09-01', hasta: '2026-09-21', completo: true });
  });
});
