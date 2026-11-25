/**
 * El POS arranca UNA vez.
 *
 * Medido en producción (2026-11-24, apertura en celular): las ventas del día
 * se pedían dos veces y la caja abierta cuatro. Dos causas en
 * `src/app/app/pos/page.tsx`:
 *
 * 1. Los efectos de arranque dependían del OBJETO `organization`.
 *    `useOrganization` entrega primero la organización guardada en el navegador
 *    y enseguida otro objeto con la misma organización, así que todo corría dos
 *    veces. Deben depender del id.
 * 2. Se pedía el resumen del día (todas las ventas de hoy, más zona horaria y
 *    horario) para guardarlo en un estado que nadie leía.
 *
 * Es una prueba de lectura del fuente, como `guardrails.test.ts`: la página no
 * se puede montar entera en jsdom y el error es fácil de reintroducir.
 */
import fs from 'fs';
import path from 'path';

const fuente = fs.readFileSync(path.resolve(__dirname, '../../app/app/pos/page.tsx'), 'utf8');

describe('POS · arranque', () => {
  test('ningún efecto depende del objeto `organization` (solo de su id)', () => {
    const dependencias = [...fuente.matchAll(/\}, \[([^\]]*)\]\);/g)].map((m) => m[1]);
    expect(dependencias.length).toBeGreaterThan(5);
    const conElObjeto = dependencias.filter((d) => d.split(',').some((parte) => parte.trim() === 'organization'));
    expect(conElObjeto).toEqual([]);
  });

  test('el arranque no pide el resumen del día, que la pantalla no muestra', () => {
    expect(fuente).not.toMatch(/getDailySummary/);
  });
});
