/**
 * Reglas de «Sedes en la web» (Figma B/11): dirección, horario de la sucursal
 * en solo lectura, «Abierto hasta …» en la zona de la sede y validación del PUT.
 */
import {
  contarCambiosSedes,
  direccionSede,
  estadoApertura,
  resumirHorario,
  slugDesdeNombre,
  slugValido,
  validarCambiosSedes,
  type RespuestaSedesWeb,
  type SedeWebFila,
} from '../sedesWeb';
import { erroresDeSlugs } from '../useSedesWeb';
import { textoHorario } from '../formatoVentas';
import { textoVentasCanonico } from '../textos';

jest.mock('next-intl', () => ({ useTranslations: () => Object.assign(() => '', { has: () => false }) }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 0 }));

const HORARIO = {
  monday: { open: '08:00', close: '20:00', closed: false },
  tuesday: { open: '08:00', close: '20:00', closed: false },
  wednesday: { open: '08:00', close: '20:00', closed: false },
  thursday: { open: '08:00', close: '20:00', closed: false },
  friday: { open: '08:00', close: '20:00', closed: false },
  saturday: { open: '08:00', close: '20:00', closed: false },
  sunday: { open: '09:00', close: '14:00', closed: false },
};

const t = (clave: string, v?: Record<string, string | number>) => {
  const s = textoVentasCanonico(clave) ?? clave;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ''));
};

describe('dirección de la sede', () => {
  test('slug desde el nombre, sin tildes ni el prefijo «Sede»', () => {
    expect(slugDesdeNombre('Sede Centro')).toBe('centro');
    expect(slugDesdeNombre('Bodega Sur 2')).toBe('bodega-sur-2');
    expect(slugDesdeNombre('Sucursal Medellín Poblado')).toBe('medellin-poblado');
    expect(slugDesdeNombre('***')).toBe('sede');
  });

  test('slugs válidos y reservados', () => {
    expect(slugValido('norte')).toBe(true);
    expect(slugValido('Norte')).toBe(false);
    expect(slugValido('a--b')).toBe(false);
    expect(slugValido('checkout')).toBe(false);
    expect(slugValido('')).toBe(false);
  });

  test('tumarca.com/centro, nunca centro.tumarca.goadmin.io', () => {
    expect(direccionSede('tumarca.com', 'centro')).toBe('tumarca.com/centro');
    expect(direccionSede('tu-marca.goadmin.io', 'norte')).toBe('tu-marca.goadmin.io/norte');
    expect(direccionSede(null, 'norte')).toBeNull();
    expect(direccionSede('tumarca.com', null)).toBeNull();
  });
});

describe('horario de la sucursal', () => {
  test('agrupa días seguidos: «Lun–Sáb 08:00–20:00 · Dom 09:00–14:00»', () => {
    expect(textoHorario(resumirHorario(HORARIO), t)).toBe('Lun–Sáb 08:00–20:00 · Dom 09:00–14:00');
  });

  test('días cerrados y sin horario', () => {
    const h = { ...HORARIO, sunday: { closed: true } };
    expect(textoHorario(resumirHorario(h), t)).toBe('Lun–Sáb 08:00–20:00 · Dom cerrado');
    expect(textoHorario(resumirHorario(null), t)).toBe('Sin horario');
    expect(resumirHorario({})).toEqual([]);
  });

  test('«Abierto hasta» en la zona de la sede (Bogotá, UTC-5)', () => {
    // Miércoles 2026-10-07 15:00 UTC = 10:00 en Bogotá.
    expect(estadoApertura(HORARIO, 'America/Bogota', new Date('2026-10-07T15:00:00Z'))).toEqual({ abierto: true, hasta: '20:00' });
    // 2026-10-08 02:00 UTC = miércoles 21:00 en Bogotá: cerrado.
    expect(estadoApertura(HORARIO, 'America/Bogota', new Date('2026-10-08T02:00:00Z'))).toEqual({ abierto: false, hasta: null });
    // El mismo instante en Madrid ya es jueves 04:00: cerrado por la mañana.
    expect(estadoApertura(HORARIO, 'Europe/Madrid', new Date('2026-10-08T02:00:00Z'))).toEqual({ abierto: false, hasta: null });
    expect(estadoApertura(null, 'America/Bogota')).toBeNull();
  });

  test('franja que cruza la medianoche', () => {
    const noche = { friday: { open: '22:00', close: '02:00', closed: false } };
    // Viernes 2026-10-09 23:30 en Bogotá = sábado 04:30 UTC.
    expect(estadoApertura(noche, 'America/Bogota', new Date('2026-10-10T04:30:00Z'))).toEqual({ abierto: true, hasta: '02:00' });
  });
});

describe('validarCambiosSedes', () => {
  test('acepta el lote y normaliza el slug', () => {
    const v = validarCambiosSedes({ modo: 'per_branch', sedes: [{ id: 1, publicada: true, slug: 'Centro', fuenteStock: true }] });
    expect(v).toEqual({ ok: true, cambios: { modo: 'per_branch', sedes: [{ id: 1, publicada: true, slug: 'centro', fuenteStock: true }] } });
  });

  test('publicar exige dirección; direcciones repetidas o inválidas; claves extra', () => {
    const v = validarCambiosSedes({
      sedes: [
        { id: 1, publicada: true, slug: null, fuenteStock: true },
        { id: 2, publicada: true, slug: 'norte', fuenteStock: true },
        { id: 3, publicada: true, slug: 'norte', fuenteStock: true },
        { id: 4, publicada: false, slug: 'checkout', fuenteStock: true },
      ],
      organization_id: 9,
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.errores).toEqual(
      expect.arrayContaining([
        { campo: 'organization_id', motivo: 'formato' },
        { campo: 'slug', motivo: 'publicar_sin_slug', id: 1 },
        { campo: 'slug', motivo: 'slug_repetido', id: 3 },
        { campo: 'slug', motivo: 'slug_invalido', id: 4 },
      ]),
    );
  });

  test('formas inválidas', () => {
    expect(validarCambiosSedes(null).ok).toBe(false);
    expect(validarCambiosSedes({ sedes: [{ id: '1', publicada: true, slug: null, fuenteStock: true }] }).ok).toBe(false);
    expect(validarCambiosSedes({ modo: 'otro', sedes: [] }).ok).toBe(false);
  });
});

describe('borrador local', () => {
  const sede = (p: Partial<SedeWebFila>): SedeWebFila => ({
    id: 1,
    nombre: 'Sede Centro',
    direccion: null,
    ciudad: null,
    principal: true,
    publicada: false,
    slug: null,
    slugSugerido: 'centro',
    fuenteStock: true,
    dominioPropio: null,
    horario: [],
    apertura: null,
    latitud: null,
    longitud: null,
    ...p,
  });

  test('cuenta cambios de modo, interruptor, dirección y stock', () => {
    const original: RespuestaSedesWeb = {
      estado: 'listo',
      modo: 'selector',
      modoPendienteMigracion: false,
      host: 'tumarca.com',
      sedes: [sede({}), sede({ id: 2, nombre: 'Norte', principal: false })],
      sedePrincipal: 'Sede Centro',
      permisos: { editar: true, publicar: true },
    };
    expect(contarCambiosSedes(original, 'selector', original.sedes)).toBe(0);
    expect(contarCambiosSedes(original, 'per_branch', [sede({ publicada: true, slug: 'centro' }), sede({ id: 2, fuenteStock: false })])).toBe(4);
  });

  test('errores de dirección del borrador', () => {
    expect(
      erroresDeSlugs([sede({ publicada: true, slug: '' }), sede({ id: 2, slug: 'norte' }), sede({ id: 3, slug: 'norte' }), sede({ id: 4, slug: 'Mal' })]),
    ).toEqual({ 1: 'requerido', 3: 'repetido', 4: 'invalido' });
  });
});
