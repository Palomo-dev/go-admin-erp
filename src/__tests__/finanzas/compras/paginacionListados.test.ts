/**
 * Paginación de 25 en los listados de facturas de compra y cuentas por pagar
 * (Figma «Mostrando 1–25», plan F4/F8).
 *
 * Trampa del kit: `useListadoServidor({ tamanoPorDefecto: 25 })` sin
 * `tamanosPermitidos` valida contra `TAMANOS_PAGINA = [10, 20, 50, 100]` y cambia
 * el 25 por el primero (10) en silencio (listadoUrl.ts `tamanoPorDefecto`). Las
 * dos pantallas paginaban de 10 en 10. Esta prueba lee el código de cada listado
 * (como los guardarraíles) y comprueba que:
 * - pasa `tamanosPermitidos` con una lista que contiene su `tamanoPorDefecto`, y
 *   el kit lo respeta;
 * - `Pagination` recibe la misma lista en `opcionesTamano` (si no, el selector
 *   ofrecería 10/20 y no 25).
 */
import * as fs from 'fs';
import * as path from 'path';
import { leerEstadoListado, tamanoPorDefecto } from '@/components/kit/listadoUrl';

const RAIZ = path.resolve(__dirname, '../../..');

const LISTADOS = [
  'components/finanzas/facturas-compra/listado/FacturasCompraListado.tsx',
  'components/finanzas/cuentas-por-pagar/listado/CuentasPorPagarListado.tsx',
];

function leer(rel: string): string {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

/** Configuración de paginación declarada en el archivo: tamaño por defecto y lista permitida. */
function configDe(src: string): { porDefecto: number; constante: string; permitidos: number[] } {
  const bloque = src.match(/useListadoServidor\(\{([\s\S]*?)\}\);/)?.[1] ?? '';
  const porDefecto = Number(bloque.match(/tamanoPorDefecto:\s*(\d+)/)?.[1]);
  const constante = bloque.match(/tamanosPermitidos:\s*(\w+)/)?.[1] ?? '';
  const lista = constante ? src.match(new RegExp(`const\\s+${constante}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '' : '';
  const permitidos = lista
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { porDefecto, constante, permitidos };
}

describe('paginación de 25 en compras y CxP', () => {
  test('sin tamanosPermitidos el kit cambia 25 por 10 (la trampa que se corrigió)', () => {
    expect(tamanoPorDefecto({ tamanoPorDefecto: 25 })).toBe(10);
  });

  it.each(LISTADOS)('%s pagina de 25 y el selector ofrece 25', (rel) => {
    const src = leer(rel);
    const { porDefecto, constante, permitidos } = configDe(src);

    expect(porDefecto).toBe(25);
    expect(constante).not.toBe('');
    expect(permitidos).toContain(porDefecto);

    const config = { tamanoPorDefecto: porDefecto, tamanosPermitidos: permitidos };
    expect(tamanoPorDefecto(config)).toBe(25);
    // Sin `tamano` en la URL, el listado arranca en 25; un tamaño ajeno a la lista vuelve a 25.
    expect(leerEstadoListado({ get: () => null }, config).tamano).toBe(25);
    expect(leerEstadoListado({ get: (k) => (k === 'tamano' ? '10' : null) }, config).tamano).toBe(25);

    // La misma lista en el selector de `Pagination`.
    expect(src).toMatch(new RegExp(`opcionesTamano=\\{${constante}\\}`));
  });
});
