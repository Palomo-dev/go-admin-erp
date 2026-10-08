/**
 * Plantilla ELEGIDA en una sede (Figma «16 Sitio web» › «Plantillas por sede»).
 *
 * Caso: un hotel (organización ficticia) con una sede restaurante. Hoy la sede nace con la
 * plantilla por defecto de su giro y HEREDA el estilo del hotel campo a campo. Con una plantilla
 * elegida (Velvet Lounge):
 * - «Plantilla completa»: estructura del restaurante con el encabezado y el pie de Velvet Lounge y
 *   su estilo como PROPIO de la sede; se conservan identidad, SEO y páginas legales de la sede.
 * - «Solo estilo»: colores y letras propios; páginas, menús y shell no cambian.
 * - «Volver a heredar»: el tema vuelve a `inherit` y nada más cambia.
 * - Validación: la plantilla debe existir; la completa, ser del giro de la sede.
 * - Sin elección, la sede queda exactamente como hoy.
 */
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { plantillaPorId } from '@/lib/website/contrato/catalogoPlantillas';
import { CATALOGO_PLANTILLAS, construirSitioDePlantilla, shellDePlantilla } from '@/lib/website/v2/plantillaCompleta';
import {
  aplicarEstiloPlantillaSede,
  armarPlantillaSede,
  documentoPlantillaSede,
  heredarEstiloSede,
  plantillaEnUsoDeSede,
  tieneEstiloPropio,
  validarPlantillaSede,
} from '@/lib/website/v2/plantillaSede';

// Un solo generador para todo el archivo: los ids nunca se repiten entre el borrador de la sede y
// lo que se arma encima (en producción es `randomUUID`).
let n = 0;
function generador() {
  return () => `id-${++n}`;
}

/** Principal de un hotel, con estilo propio (azul y Outfit). */
function principal(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { nombre: { mode: 'value', value: 'Hotel de prueba' } },
    tema: {
      plantillaBase: { mode: 'value', value: 'hotel_minimal' },
      colores: { primario: { mode: 'value', value: '#4A5568' }, acento: { mode: 'value', value: '#0EA5E9' } },
      tipografia: { titulos: { mode: 'value', value: 'Outfit' } },
    },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: null, menuMegaId: null, opciones: {} },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [],
    paginas: [{ id: 'p-home', slug: 'home', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

/** Borrador de la sede restaurante tal como nace hoy (plantilla por defecto, tema heredado). */
function sedeDeHoy(): DocumentoSitio {
  const d = documentoPlantillaSede(principal(), 'restaurant', generador());
  if (!d) throw new Error('sin plantilla');
  return d;
}

const VELVET = plantillaPorId(CATALOGO_PLANTILLAS, 'velvet_lounge')!;
const HOTEL_LUJO = plantillaPorId(CATALOGO_PLANTILLAS, 'hotel_luxury')!;

describe('validarPlantillaSede: catálogo y giro', () => {
  test('una plantilla que no está en el catálogo no pasa', () => {
    expect(validarPlantillaSede('no_existe', 'restaurant', 'completa')).toEqual({ ok: false, motivo: 'plantilla_no_existe' });
    expect(validarPlantillaSede(undefined, 'restaurant', 'estilo')).toEqual({ ok: false, motivo: 'plantilla_no_existe' });
    expect(validarPlantillaSede('toString', 'restaurant', 'estilo')).toEqual({ ok: false, motivo: 'plantilla_no_existe' });
  });

  test('«Plantilla completa» exige el giro de la sede', () => {
    const ok = validarPlantillaSede('velvet_lounge', 'restaurant', 'completa');
    expect(ok.ok && ok.plantilla.id).toBe('velvet_lounge');
    expect(validarPlantillaSede('hotel_luxury', 'restaurant', 'completa')).toEqual({ ok: false, motivo: 'plantilla_otro_giro' });
    expect(validarPlantillaSede('velvet_lounge', null, 'completa')).toEqual({ ok: false, motivo: 'sede_sin_tipo' });
    expect(validarPlantillaSede('velvet_lounge', 'main', 'completa')).toEqual({ ok: false, motivo: 'sede_sin_tipo' });
  });

  test('«Solo estilo» admite cualquier plantilla del catálogo, aun sin tipo de negocio', () => {
    expect(validarPlantillaSede('hotel_luxury', 'restaurant', 'estilo').ok).toBe(true);
    expect(validarPlantillaSede('velvet_lounge', null, 'estilo').ok).toBe(true);
  });
});

describe('«Plantilla completa» de Velvet Lounge en la sede restaurante', () => {
  const actual = sedeDeHoy();
  const r = armarPlantillaSede({ base: principal(), actual }, VELVET, generador(), { extendidos: false });
  const d = r.documento;

  test('cumple el contrato y trae el juego del restaurante con Carta QR', () => {
    expect(validarDocumentoSitio(d).ok).toBe(true);
    const slugs = d.paginas.map((p) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining(['home', 'menu', 'reservas-mesa', 'carta-qr', 'terminos', 'privacidad']));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(r.resumen.paginas).toBeGreaterThan(0);
  });

  test('encabezado y pie de Velvet Lounge (no los de la plantilla por defecto)', () => {
    const velvet = shellDePlantilla('velvet_lounge', 'restaurante');
    expect(d.shell.header.composicion).toBe(velvet.encabezado.composicion);
    expect(d.shell.footer.composicion).toBe(velvet.pie.composicion);
  });

  test('el estilo es PROPIO de la sede: los valores de Velvet Lounge, acento incluido', () => {
    expect(d.tema.colores.primario).toEqual({ mode: 'value', value: VELVET.estilo.acento });
    expect(d.tema.colores.acento).toEqual({ mode: 'value', value: VELVET.estilo.acento });
    expect(d.tema.colores.fondo).toEqual({ mode: 'value', value: VELVET.estilo.fondo });
    expect(d.tema.tipografia.titulos).toEqual({ mode: 'value', value: VELVET.estilo.fuenteTitulos });
    expect(d.tema.plantillaBase).toEqual({ mode: 'value', value: VELVET.base });
    expect(tieneEstiloPropio(d)).toBe(true);
    expect(plantillaEnUsoDeSede(d)).toBe('velvet_lounge');
  });

  test('identidad, SEO y contenido de la sede siguen heredados (no se copian del hotel)', () => {
    expect(d.identidad).toEqual(actual.identidad);
    expect(d.seo).toEqual(actual.seo);
    expect(d.contenido).toEqual(actual.contenido);
  });

  test('no muta el borrador de la sede', () => {
    const antes = JSON.stringify(actual);
    armarPlantillaSede({ base: principal(), actual }, VELVET, generador(), { extendidos: true });
    expect(JSON.stringify(actual)).toBe(antes);
  });

  test('sin borrador, parte de la sede vacía que hereda del principal', () => {
    const sinSitio = armarPlantillaSede({ base: principal(), actual: null }, VELVET, generador(), { extendidos: false }).documento;
    expect(validarDocumentoSitio(sinSitio).ok).toBe(true);
    expect(sinSitio.identidad.nombre).toBeUndefined();
    expect(sinSitio.tema.colores.primario).toEqual({ mode: 'value', value: VELVET.estilo.acento });
  });

  test('con tokens extendidos escribe además el preset', () => {
    const ext = armarPlantillaSede({ base: principal(), actual }, VELVET, generador(), { extendidos: true }).documento;
    expect(ext.tema.preset).toEqual({ mode: 'value', value: 'velvet_lounge' });
    expect(validarDocumentoSitio(ext).ok).toBe(true);
  });
});

describe('«Solo estilo» en la sede', () => {
  const actual = sedeDeHoy();
  const d = aplicarEstiloPlantillaSede(actual, VELVET, false);

  test('solo cambia el tema: páginas, menús, encabezado, pie e identidad iguales', () => {
    expect(d.paginas).toEqual(actual.paginas);
    expect(d.menus).toEqual(actual.menus);
    expect(d.shell).toEqual(actual.shell);
    expect(d.identidad).toEqual(actual.identidad);
    expect(validarDocumentoSitio(d).ok).toBe(true);
  });

  test('colores y letras propios de la sede', () => {
    expect(tieneEstiloPropio(actual)).toBe(false);
    expect(tieneEstiloPropio(d)).toBe(true);
    expect(d.tema.colores.primario).toEqual({ mode: 'value', value: VELVET.estilo.acento });
    expect(d.tema.colores.acento).toEqual({ mode: 'value', value: VELVET.estilo.acento });
    expect(d.tema.tipografia.cuerpo).toEqual({ mode: 'value', value: VELVET.estilo.fuenteCuerpo });
    expect(plantillaEnUsoDeSede(d)).toBe('velvet_lounge');
  });

  test('de otro giro también vale (solo colores y letras)', () => {
    const hotel = aplicarEstiloPlantillaSede(actual, HOTEL_LUJO, false);
    expect(hotel.paginas).toEqual(actual.paginas);
    expect(hotel.tema.colores.primario).toEqual({ mode: 'value', value: HOTEL_LUJO.estilo.acento });
  });
});

describe('estilo propio frente a la herencia: «Volver a heredar el estilo del sitio principal»', () => {
  const actual = sedeDeHoy();
  const propio = aplicarEstiloPlantillaSede(actual, VELVET, true);
  const heredado = heredarEstiloSede(propio);

  test('todos los campos del tema vuelven a heredar y los tokens nuevos se quitan', () => {
    expect(tieneEstiloPropio(heredado)).toBe(false);
    expect(heredado.tema.plantillaBase).toEqual({ mode: 'inherit' });
    expect(heredado.tema.modo).toEqual({ mode: 'inherit' });
    for (const c of ['primario', 'secundario', 'acento', 'fondo', 'texto'] as const) expect(heredado.tema.colores[c]).toEqual({ mode: 'inherit' });
    expect(heredado.tema.tipografia).toEqual({ titulos: { mode: 'inherit' }, cuerpo: { mode: 'inherit' } });
    expect(heredado.tema.preset).toBeUndefined();
    expect(heredado.tema.radio).toBeUndefined();
    expect(plantillaEnUsoDeSede(heredado)).toBeNull();
    expect(validarDocumentoSitio(heredado).ok).toBe(true);
  });

  test('no toca el contenido de la sede', () => {
    expect(heredado.paginas).toEqual(propio.paginas);
    expect(heredado.menus).toEqual(propio.menus);
    expect(heredado.shell).toEqual(propio.shell);
    expect(heredado.identidad).toEqual(propio.identidad);
  });

  test('es idempotente', () => {
    expect(heredarEstiloSede(heredado)).toEqual(heredado);
  });
});

describe('la sede sin plantilla elegida queda igual que hoy', () => {
  test('nace con la plantilla por defecto del giro y el tema heredado', () => {
    const hoy = sedeDeHoy();
    expect(tieneEstiloPropio(hoy)).toBe(false);
    expect(plantillaEnUsoDeSede(hoy)).toBeNull();
    expect(hoy.tema.colores.primario).toEqual({ mode: 'inherit' });
    // Mismo documento que la plantilla por defecto del giro sin estilo (más Carta QR).
    const porDefecto = construirSitioDePlantilla('restaurante', { ...hoy, paginas: [], menus: [] }, generador(), { conEstilo: false });
    expect(hoy.shell.header.composicion).toBe(porDefecto.shell.header.composicion);
    expect(hoy.tema).toEqual(porDefecto.tema);
  });

  test('sin tipo, null como siempre', () => {
    expect(documentoPlantillaSede(principal(), null, generador())).toBeNull();
  });
});
