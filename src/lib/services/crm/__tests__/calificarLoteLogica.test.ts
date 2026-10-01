/**
 * «Calificar en lote»: nombre de cada oportunidad desde el patrón.
 */
// El esquema de alta arrastra `orgContext` (svix, ESM): se dobla lo mínimo.
jest.mock('@/lib/utils/orgContext', () => ({ OrgContextError: class extends Error {}, hasOrgAdminOrPermission: jest.fn() }));

import { LARGO_MAXIMO_NOMBRE, LEAD_SIN_NOMBRE, MARCADOR_CLIENTE, nombreDesdePatron, patronPersonaliza } from '../calificarLoteLogica';
import { oportunidadAltaSchema } from '../opportunityWriteService';

describe('nombreDesdePatron', () => {
  it('reemplaza cada {cliente} por el nombre del lead, sin espacios sobrantes', () => {
    expect(nombreDesdePatron('Uniformes · {cliente}', '  Ana   Gómez ')).toBe('Uniformes · Ana Gómez');
    expect(nombreDesdePatron('{cliente} — renovación {cliente}', 'Tienda 12')).toBe('Tienda 12 — renovación Tienda 12');
  });

  it('lead sin nombre → «Lead sin nombre»', () => {
    expect(nombreDesdePatron('Demo · {cliente}', null)).toBe(`Demo · ${LEAD_SIN_NOMBRE}`);
    expect(nombreDesdePatron('Demo · {cliente}', '   ')).toBe(`Demo · ${LEAD_SIN_NOMBRE}`);
  });

  it('sin marcador se usa tal cual; patrón vacío deja el nombre del lead', () => {
    expect(nombreDesdePatron('Implementación 2027', 'Ana')).toBe('Implementación 2027');
    expect(nombreDesdePatron('   ', 'Ana')).toBe('Ana');
    expect(patronPersonaliza('Implementación')).toBe(false);
    expect(patronPersonaliza(`X · ${MARCADOR_CLIENTE}`)).toBe(true);
  });

  it('se recorta al límite del esquema de alta (255) con «…» y sigue siendo válido', () => {
    const nombre = nombreDesdePatron(`${'x'.repeat(250)} · {cliente}`, 'Nombre largo de empresa');
    expect(nombre).toHaveLength(LARGO_MAXIMO_NOMBRE);
    expect(nombre.endsWith('…')).toBe(true);
    expect(oportunidadAltaSchema.safeParse({ name: nombre }).success).toBe(true);
    expect(oportunidadAltaSchema.safeParse({ name: `${nombre}y` }).success).toBe(false);
  });
});
