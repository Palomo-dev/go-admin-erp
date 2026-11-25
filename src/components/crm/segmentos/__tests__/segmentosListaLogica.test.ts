/**
 * Segmentos (Figma CRM 1384:17 «Listado» y 1384:1045 «Miembros»): filtro,
 * contactables desde `counts_json`, «Usado en», tiempo relativo y la lista de
 * «Importar lista».
 */
import {
  bandaSalud,
  conteosDesdeDesglose,
  contactables,
  enUso,
  filtrarSegmentos,
  haceCuanto,
  instanteActualizado,
  leerConteos,
  leerUsos,
  piezasDeUso,
  reglasDeResumen,
} from '../segmentosListaLogica';
import { colaTelefono, esCorreo, valoresDeLista, variantesTelefono } from '@/lib/services/crm/segmentosImportacionLogica';
import type { Segment } from '../types';

const seg = (p: Partial<Segment>): Segment => ({
  id: 's1',
  organization_id: 1,
  name: 'Ferreterías',
  description: null,
  filter_json: [],
  is_dynamic: true,
  customer_count: 0,
  last_run_at: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: null,
  ...p,
});

describe('listado de segmentos', () => {
  test('filtra por texto (nombre o descripción) y por tipo', () => {
    const lista = [seg({ id: 'a', name: 'Ferreterías de Medellín' }), seg({ id: 'b', name: 'Feria', is_dynamic: false, description: 'Importado de CSV' })];
    expect(filtrarSegmentos(lista, 'medell', 'todos').map((s) => s.id)).toEqual(['a']);
    expect(filtrarSegmentos(lista, 'csv', 'todos').map((s) => s.id)).toEqual(['b']);
    expect(filtrarSegmentos(lista, '', 'estaticos').map((s) => s.id)).toEqual(['b']);
    expect(filtrarSegmentos(lista, '', 'dinamicos').map((s) => s.id)).toEqual(['a']);
  });

  test('counts_json: formato desconocido = sin dato, nunca ceros', () => {
    expect(leerConteos(null)).toBeNull();
    expect(leerConteos({ total: 3 })).toBeNull();
    const c = conteosDesdeDesglose(10, 100, { telefono: 6, no_llamar: 2, correo: 7, whatsapp: 1 });
    expect(leerConteos(c)).toEqual(c);
    expect(c).toMatchObject({ total: 10, base: 100, with_phone: 8, rne_excluded: 2, voice_contactable: 6, email_contactable: 7, whatsapp_contactable: 1 });
    expect(contactables(c)).toEqual({ telefono: 6, correo: 7, whatsapp: 1 });
    // Ninguna cifra supera el total (la base lo valida en crm_continue_segment_recount).
    expect(conteosDesdeDesglose(2, 1, { telefono: 9, no_llamar: 9, correo: 9, whatsapp: 9 })).toMatchObject({ base: 2, with_phone: 2, voice_contactable: 2 });
  });

  test('«Usado en» solo muestra lo que existe', () => {
    const usos = leerUsos([{ id: 's1', campaigns: 2, voice_campaigns: 0, sequences: 1 }, { id: 's2', campaigns: 0, voice_campaigns: 0, sequences: 0 }, 'basura']);
    expect(piezasDeUso(usos.get('s1'))).toEqual([{ clave: 'campanas', n: 2 }, { clave: 'secuencias', n: 1 }]);
    expect(enUso(usos.get('s2'))).toBe(false);
    expect(enUso(undefined)).toBe(false);
  });

  test('«Actualizado»: dinámico = último conteo; estático = foto de miembros', () => {
    expect(instanteActualizado(seg({ counted_at: '2026-10-01T10:00:00Z', last_run_at: '2026-09-01T10:00:00Z' }))).toBe('2026-10-01T10:00:00Z');
    expect(instanteActualizado(seg({ is_dynamic: false, members_snapshotted_at: '2026-09-14T10:00:00Z' }))).toBe('2026-09-14T10:00:00Z');
  });

  test('resumen de reglas del primer grupo y grupos extra', () => {
    const r = reglasDeResumen({ grupos: [[{ field: 'city', operator: 'equals', value: 'Medellín' }], [{ field: 'tags', operator: 'contains', value: 'vip' }]] } as Segment['filter_json']);
    expect(r).toEqual({ piezas: [{ campo: 'city', operador: 'equals', valor: 'Medellín' }], gruposExtra: 1 });
  });

  test('tiempo relativo con mayúscula inicial', () => {
    const ahora = Date.parse('2026-10-01T12:00:00Z');
    expect(haceCuanto('2026-10-01T11:48:00Z', 'es-CO', ahora)).toMatch(/^Hace 12 min/);
    expect(haceCuanto(null, 'es-CO', ahora)).toBe('');
  });

  test('banda de salud', () => {
    expect([bandaSalud(85), bandaSalud(50), bandaSalud(10), bandaSalud(null)]).toEqual(['verde', 'amarilla', 'roja', 'sinDato']);
  });
});

describe('importar lista', () => {
  test('separa por línea, coma o punto y coma, sin repetidos', () => {
    expect(valoresDeLista('a@x.co\nA@X.co; 3001234567,\n\n"123"')).toEqual(['a@x.co', '3001234567', '123']);
  });
  test('correo vs. resto, y teléfonos por sus últimos 10 dígitos', () => {
    expect(esCorreo('a@x.co')).toBe(true);
    expect(esCorreo('3001234567')).toBe(false);
    expect(colaTelefono('+57 300 123 4567')).toBe('3001234567');
    expect(variantesTelefono('300 123 4567')).toEqual(expect.arrayContaining(['3001234567', '+573001234567', '+57 300 123 4567']));
    expect(variantesTelefono('123')).toEqual([]);
  });
});
