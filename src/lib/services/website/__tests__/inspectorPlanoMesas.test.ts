/**
 * Pestaña Contenido de «Reserva de mesa · Plano de mesas» igual a la lámina 15 (Figma 2223:46106,
 * panel 2259:51111): bloques Textos · Cómo se confirma · Sedes y plano · Reglas, en ese orden, con
 * el «Modo» como lista desplegable. Las demás variantes de `reservation` no cambian.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));


import { getSectionDefinition, type ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { campoVisible } from '@/components/sitio-web/editor/inspector/CampoSeccion';

const reserva = getSectionDefinition('reservation')!;
const visibles = (variante: string, contenido: Record<string, unknown> = {}) =>
  reserva.contentFields.filter((c) => ['content', 'data'].includes(c.group ?? 'content') && campoVisible(c, contenido, variante));
const claves = (lista: ContentFieldDef[]) => lista.map((c) => c.key);

describe('Plano de mesas · pestaña Contenido (lámina 15)', () => {
  test('bloques y orden de la lámina, en modo directo al ERP', () => {
    const lista = visibles('floor_plan').filter((c) => c.type !== 'section_header' && c.type !== 'section_background');
    const porBloque = lista.reduce<Record<string, string[]>>((acc, c) => ({ ...acc, [c.section ?? '—']: [...(acc[c.section ?? '—'] ?? []), c.key] }), {});
    expect(Object.keys(porBloque).slice(0, 4)).toEqual(['Textos', 'Cómo se confirma', 'Sedes y plano', 'Reglas']);
    expect(porBloque['Textos']).toEqual(['eyebrow', 'title', 'subtitle', 'cta_text']);
    expect(porBloque['Cómo se confirma']).toEqual(['booking_mode']);
    expect(porBloque['Sedes y plano']).toEqual(['branch_ids', 'zones', 'show_legend', 'show_capacity']);
    expect(porBloque['Reglas']).toEqual(['min_guests', 'max_guests', 'max_days', 'show_notes', 'require_email', 'policy_text', 'success_message', 'pending_message']);
    // Cada clave una sola vez (las copias de la variante reemplazan a las de siempre).
    expect(new Set(claves(lista)).size).toBe(lista.length);
    expect(claves(lista)).not.toContain('anchor_id');
  });

  test('«Modo» es una lista desplegable; en WhatsApp aparecen «Registrar también» y el número (solo lectura)', () => {
    const modo = visibles('floor_plan').find((c) => c.key === 'booking_mode')!;
    expect(modo).toMatchObject({ type: 'select', display: 'dropdown' });
    expect(modo.options?.map((o) => o.value)).toEqual(['erp', 'whatsapp']);
    const confirma = visibles('floor_plan', { booking_mode: 'whatsapp' }).filter((c) => c.section === 'Cómo se confirma');
    expect(claves(confirma)).toEqual(['booking_mode', 'also_register', '_whatsapp_sede']);
    expect(confirma[2]).toMatchObject({ type: 'notice', display: 'field', placeholder: 'El de cada sede' });
  });

  test('personas desde · hasta en una fila; el ancla pasa a Avanzado', () => {
    const lista = visibles('floor_plan');
    expect(lista.filter((c) => c.half).map((c) => c.key)).toEqual(['min_guests', 'max_guests']);
    const ancla = reserva.contentFields.filter((c) => c.key === 'anchor_id' && campoVisible(c, {}, 'floor_plan'));
    expect(ancla).toHaveLength(1);
    expect(ancla[0].group).toBe('advanced');
  });

  test('las demás variantes siguen con sus campos de siempre, sin bloques', () => {
    for (const variante of ['stepper', 'form_image', 'band', 'hero_widget']) {
      const lista = visibles(variante);
      expect(claves(lista)).toEqual(expect.arrayContaining(['eyebrow', 'title', 'branch_ids', 'min_guests', 'policy_text', 'success_message', 'anchor_id']));
      expect(lista.filter((c) => ['Textos', 'Reglas'].includes(c.section ?? ''))).toHaveLength(0);
      expect(claves(lista)).not.toContain('booking_mode');
    }
    expect(claves(visibles('external'))).toEqual(expect.arrayContaining(['eyebrow', 'external_url', 'anchor_id']));
  });
});

describe('Carta · Línea de puntos · «Solo destacados»', () => {
  const carta = getSectionDefinition('menu_full')!;
  const ver = (contenido: Record<string, unknown>) => carta.contentFields.filter((c) => campoVisible(c, contenido, 'dotted')).map((c) => c.key);

  test('encendido: cantidad y botón; sin selector de sede, contador ni pestañas', () => {
    const solo = ver({ only_featured: true });
    expect(solo).toEqual(expect.arrayContaining(['only_featured', 'featured_limit', 'view_all_text', 'view_all_url']));
    for (const k of ['show_branch_selector', 'branch_ids', 'show_counter', 'counter_label', 'tabs_style', 'branch_selector_style', 'sticky_tabs']) expect(solo).not.toContain(k);
  });

  test('apagado: la carta entera, como antes', () => {
    const entera = ver({});
    expect(entera).toEqual(expect.arrayContaining(['only_featured', 'show_branch_selector', 'branch_ids', 'show_counter', 'tabs_style', 'sticky_tabs']));
    expect(entera).not.toContain('featured_limit');
  });
});
