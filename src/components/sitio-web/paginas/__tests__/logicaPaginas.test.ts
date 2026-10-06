/**
 * Lógica pura de Sitio web › Páginas (Figma A/04a-04e, D/04-09, D/04-10): operaciones sobre
 * páginas y menús del documento V2, filas de la tabla, salud SEO, plantillas, páginas base,
 * fechas relativas y parámetros de la API. Cada documento resultante debe pasar el contrato
 * (`validarDocumentoSitio`), que es lo que exige `guardarBorrador`.
 */
import { validarDocumentoSitio, VERSION_ESQUEMA_DOCUMENTO, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import {
  alternarPaginaEnMenu,
  cabeHijo,
  crearMenu,
  eliminarMenu,
  insertarItem,
  menuEncabezado,
  menusPie,
  moverEntreHermanos,
  nuevoItem,
  paginasEnMenu,
  puedeAnidar,
  quitarItem,
  restablecerMenusDesde,
  ubicacionDeMenu,
  urlContacto,
} from '../operacionesMenu';
import {
  cambiarDireccion,
  crearPaginaDesdePlantilla,
  duplicarPagina,
  eliminarPagina,
  fijarEnMenu,
  fijarPublicada,
  restaurarPaginasBase,
  validarSlug,
} from '../operacionesPagina';
import {
  PAGINAS_BASE_GIRO,
  PLANTILLAS_PAGINA,
  giroDeSede,
  giroDeTipoOrganizacion,
  paginasBasePorGiro,
  plantillaPorId,
  plantillasParaGiro,
  slugDesdeTexto,
  slugLibre,
} from '../plantillasPagina';
import { saludSeo } from '../saludSeo';
import { claveTipoPagina, esInicio, esPaginaLegal, esPlantillaTienda } from '../tipoPagina';
import { cambiosDePagina, contarPaginas, enPestana, filasPaginas } from '../vistaPaginas';
import { fechaRelativa } from '../fechaPagina';
import { esIdPagina, sitioDeCuerpo, sitioDeParametro, versionDeCuerpo } from '../parametrosPaginas';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

let n = 0;
const generarId = () => `id-${++n}`;

function documento(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: VERSION_ESQUEMA_DOCUMENTO,
    tema: {},
    shell: { header: { composicion: 'H01', menuPrincipalId: 'principal' }, footer: { composicion: 'F03', menuIds: ['legales'] } },
    menus: [
      {
        id: 'principal',
        nombre: 'Principal',
        items: [
          { id: 'i1', etiqueta: 'Inicio', tipo: 'page', paginaId: 'p-inicio' },
          {
            id: 'i2',
            etiqueta: 'Carta',
            tipo: 'page',
            paginaId: 'p-carta',
            hijos: [{ id: 'i3', etiqueta: 'Bebidas', tipo: 'entity', entidad: 'category', entidadId: '42' }],
          },
        ],
      },
      { id: 'legales', nombre: 'Legales', items: [{ id: 'i9', etiqueta: 'Privacidad', tipo: 'page', paginaId: 'p-priv' }] },
    ],
    paginas: [
      { id: 'p-inicio', slug: 'home', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [{ id: 's1', tipo: 'hero', variante: 'minimal', version: 1, contenido: {} }] },
      { id: 'p-carta', slug: 'carta', tipo: 'builtin', titulo: 'Carta', publicada: true, secciones: [] },
      { id: 'p-eventos', slug: 'eventos', tipo: 'builtin', titulo: 'Eventos', publicada: false, secciones: [] },
      { id: 'p-priv', slug: 'privacidad', tipo: 'legal', titulo: 'Política de privacidad', publicada: true, secciones: [] },
      { id: 'p-prod', slug: 'plantillas/producto', tipo: 'product_detail', titulo: 'Detalle', publicada: true, secciones: [] },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

function valido(d: DocumentoSitio) {
  const r = validarDocumentoSitio(d);
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.ok;
}

describe('operaciones de página', () => {
  test('crear desde plantilla: slug normalizado, en el menú y documento válido', () => {
    const r = crearPaginaDesdePlantilla(documento(), plantillaPorId('carta')!, { titulo: 'Carta de temporada', slug: '/Carta de Temporada', enMenu: true }, generarId);
    if (!r.ok) throw new Error(r.error);
    const nueva = r.documento.paginas.find((p) => p.id === r.paginaId)!;
    expect(nueva.slug).toBe('carta-de-temporada');
    expect(nueva.publicada).toBe(true);
    expect(paginasEnMenu(menuEncabezado(r.documento)).has(nueva.id)).toBe(true);
    expect(valido(r.documento)).toBe(true);
  });

  test('crear: errores de nombre y dirección', () => {
    const d = documento();
    const p = plantillaPorId('en_blanco')!;
    expect(crearPaginaDesdePlantilla(d, p, { titulo: ' ', slug: 'x', enMenu: false }, generarId)).toEqual({ ok: false, error: 'titulo_vacio' });
    expect(crearPaginaDesdePlantilla(d, p, { titulo: 'X', slug: 'carta', enMenu: false }, generarId)).toEqual({ ok: false, error: 'slug_repetido' });
    expect(crearPaginaDesdePlantilla(d, p, { titulo: 'X', slug: '¿?', enMenu: false }, generarId)).toEqual({ ok: false, error: 'slug_vacio' });
    expect(validarSlug(d, 'plantillas/otra')).toEqual({ ok: false, error: 'slug_invalido' });
  });

  test('cambiar dirección conserva la propia y rechaza la ajena', () => {
    const d = documento();
    expect(cambiarDireccion(d, 'p-carta', 'carta').ok).toBe(true);
    expect(cambiarDireccion(d, 'p-carta', 'eventos')).toEqual({ ok: false, error: 'slug_repetido' });
  });

  test('duplicar: ids nuevos, dirección libre y fuera del menú', () => {
    const r = duplicarPagina(documento(), 'p-inicio', '(copia)', generarId);
    if (!r.ok) throw new Error(r.error);
    const copia = r.documento.paginas.find((p) => p.id === r.paginaId)!;
    expect(copia.titulo).toBe('Inicio (copia)');
    expect(copia.slug).toBe('home-copia');
    expect(copia.secciones[0].id).not.toBe('s1');
    expect(paginasEnMenu(menuEncabezado(r.documento)).has(copia.id)).toBe(false);
    expect(valido(r.documento)).toBe(true);
  });

  test('ocultar del sitio cambia `publicada`', () => {
    const r = fijarPublicada(documento(), 'p-carta', false);
    expect(r.ok && r.documento.paginas.find((p) => p.id === 'p-carta')!.publicada).toBe(false);
  });

  test('en el menú: quitar se lleva los hijos al nivel del padre; poner lo añade al final', () => {
    const quitada = fijarEnMenu(documento(), 'p-carta', false, generarId);
    if (!quitada.ok) throw new Error(quitada.error);
    expect(paginasEnMenu(menuEncabezado(quitada.documento)).has('p-carta')).toBe(false);
    expect(valido(quitada.documento)).toBe(true);
    const puesta = fijarEnMenu(documento(), 'p-eventos', true, generarId);
    if (!puesta.ok) throw new Error(puesta.error);
    expect(menuEncabezado(puesta.documento)!.items.at(-1)).toMatchObject({ tipo: 'page', paginaId: 'p-eventos' });
  });

  test('eliminar quita los enlaces de todos los menús; Inicio no se elimina', () => {
    const r = eliminarPagina(documento(), 'p-priv');
    if (!r.ok) throw new Error(r.error);
    expect(r.documento.paginas.some((p) => p.id === 'p-priv')).toBe(false);
    expect(menusPie(r.documento)[0].items).toHaveLength(0);
    expect(valido(r.documento)).toBe(true);
    expect(eliminarPagina(documento(), 'p-inicio')).toEqual({ ok: false, error: 'no_se_elimina_inicio' });
  });

  test('restaurar páginas base: solo las que faltan; legales al pie', () => {
    const r = restaurarPaginasBase(documento(), 'restaurante', generarId);
    if (!r.ok) throw new Error(r.error);
    // home ya existía y privacidad también: faltan 6 del giro + términos.
    expect(r.creadas).toBe(paginasBasePorGiro('restaurante').length - 2);
    const terminos = r.documento.paginas.find((p) => p.slug === 'terminos')!;
    expect(paginasEnMenu(menusPie(r.documento)[0]).has(terminos.id)).toBe(true);
    expect(paginasEnMenu(menuEncabezado(r.documento)).has(terminos.id)).toBe(false);
    expect(valido(r.documento)).toBe(true);
    const otra = restaurarPaginasBase(r.documento, 'restaurante', generarId);
    expect(otra.ok && otra.creadas).toBe(0);
  });
});

describe('operaciones de menú', () => {
  test('anidar respeta la profundidad del contrato y evita ciclos', () => {
    const items = menuEncabezado(documento())!.items;
    expect(puedeAnidar(items, 'i2', 'i3')).toBe('ciclo');
    expect(cabeHijo(items, 'i3')).toBe(true);
    const profundo = insertarItem(items, nuevoItem({ tipo: 'custom', url: 'https://a.co' }, 'A', () => 'n1'), 'i3');
    expect(cabeHijo(profundo, 'n1')).toBe(false);
  });

  test('quitar e insertar sin dejar `hijos: []`', () => {
    const items = menuEncabezado(documento())!.items;
    const { items: sin, quitado } = quitarItem(items, 'i3');
    expect(quitado?.id).toBe('i3');
    expect('hijos' in sin[1]).toBe(false);
    expect(moverEntreHermanos(items, 'i2', -1).map((i) => i.id)).toEqual(['i2', 'i1']);
  });

  test('menús con nombre: ubicación, límite de columnas del pie y restablecer', () => {
    const d = documento();
    expect(ubicacionDeMenu(d, 'principal')).toEqual({ tipo: 'encabezado' });
    expect(ubicacionDeMenu(d, 'legales')).toEqual({ tipo: 'pie', columna: 1 });
    const r = crearMenu(d, { nombre: 'Temporada', ubicacion: { tipo: 'sin' } }, generarId);
    if (!r.ok) throw new Error(r.error);
    expect(ubicacionDeMenu(r.documento, r.menuId)).toEqual({ tipo: 'sin' });
    expect(valido(r.documento)).toBe(true);
    expect(crearMenu(d, { nombre: '  ', ubicacion: { tipo: 'sin' } }, generarId)).toEqual({ ok: false, error: 'nombre_vacio' });
    const sinPie = eliminarMenu(d, 'legales');
    expect(sinPie.shell.footer.menuIds).toEqual([]);
    const restablecido = restablecerMenusDesde(sinPie, d);
    expect(restablecido.menus.map((m) => m.id)).toEqual(d.menus.map((m) => m.id));
    expect(restablecido.shell.footer.menuIds).toEqual(['legales']);
  });

  test('alternar en el menú sin encabezado crea el menú', () => {
    const d = { ...documento(), menus: [], shell: { ...documento().shell, header: { composicion: 'H01', opciones: {}, menuPrincipalId: null }, footer: { ...documento().shell.footer, composicion: 'F03', menuIds: [] } } } as DocumentoSitio;
    const r = alternarPaginaEnMenu(d, 'p-carta', true, generarId);
    if (!r.ok) throw new Error(r.error);
    expect(paginasEnMenu(menuEncabezado(r.documento)).has('p-carta')).toBe(true);
  });

  test('WhatsApp y teléfono', () => {
    expect(urlContacto('whatsapp', '+57 300 123 4567')).toMatch(/^https:\/\/wa\.me\/573001234567/);
    expect(urlContacto('telefono', '300 123 4567')).toBe('tel:3001234567');
  });
});

describe('vista de la tabla (A/04a)', () => {
  test('filas: excluye plantillas de Tienda, estado, en el menú, legal y SEO', () => {
    const d = documento();
    const filas = filasPaginas({ documento: d, publicado: d, actualizadoBorrador: '2026-10-06T15:12:00Z', publicadoEn: '2026-10-01T10:00:00Z' });
    expect(filas.map((f) => f.id)).toEqual(['p-inicio', 'p-carta', 'p-eventos', 'p-priv']);
    const porId = Object.fromEntries(filas.map((f) => [f.id, f]));
    expect(porId['p-inicio']).toMatchObject({ ruta: '/', inicio: true, enMenu: true, estado: { tipo: 'publicado' }, actualizadaEn: '2026-10-01T10:00:00Z' });
    expect(porId['p-eventos']).toMatchObject({ estado: { tipo: 'sin_publicar' }, seo: 'sin_revisar', enMenu: false });
    expect(porId['p-priv']).toMatchObject({ legal: true, tipo: 'legal' });
    expect(contarPaginas(filas)).toEqual({ todas: 4, menu: 2, ocultas: 1, legales: 1, conCambios: 0 });
    expect(filas.filter((f) => enPestana(f, 'ocultas')).map((f) => f.id)).toEqual(['p-eventos']);
  });

  test('cambios sin publicar por sección y fecha del borrador', () => {
    const publicado = documento();
    const borrador = documento();
    borrador.paginas[0] = { ...borrador.paginas[0], secciones: [{ ...borrador.paginas[0].secciones[0], contenido: { title: 'Hola' } }] };
    expect(cambiosDePagina(borrador.paginas[0], publicado.paginas[0])).toBe(1);
    const filas = filasPaginas({ documento: borrador, publicado, actualizadoBorrador: '2026-10-06T15:12:00Z', publicadoEn: '2026-10-01T10:00:00Z' });
    expect(filas[0]).toMatchObject({ estado: { tipo: 'cambios', cantidad: 1 }, actualizadaEn: '2026-10-06T15:12:00Z' });
    expect(contarPaginas(filas).conCambios).toBe(1);
  });

  test('salud SEO: descripción, imagen y la del sitio para Inicio', () => {
    const d = documento();
    const carta = d.paginas[1];
    expect(saludSeo(carta, d)).toBe('falta_descripcion');
    const conDesc = { ...carta, seo: { descripcion: { mode: 'value' as const, value: 'Platos' } } };
    expect(saludSeo(conDesc, d)).toBe('falta_imagen');
    const sitio = { seo: { imagenOgUrl: { mode: 'value' as const, value: 'https://x.co/a.jpg' }, descripcion: { mode: 'value' as const, value: 'Sitio' } } };
    expect(saludSeo(conDesc, sitio)).toBe('completo');
    expect(saludSeo(d.paginas[0], sitio)).toBe('completo');
  });
});

describe('tipos, plantillas y páginas base', () => {
  test('una sede restaurante de un hotel ofrece las páginas de restaurante (giroDeSede)', () => {
    const giro = giroDeSede('restaurant', giroDeTipoOrganizacion(2));
    expect(giro).toBe('restaurante');
    expect(plantillasParaGiro(giro).map((p) => p.id)).toEqual(expect.arrayContaining(['carta', 'carta_qr']));
    // Sin tipo de sede (o uno desconocido): el giro de la organización.
    expect(giroDeSede(null, 'hotel')).toBe('hotel');
    expect(giroDeSede('', 'hotel')).toBe('hotel');
    expect(giroDeSede('main', 'hotel')).toBe('hotel');
  });

  test('tipo de página', () => {
    expect(esInicio({ tipo: 'builtin', slug: 'home' })).toBe(true);
    expect(claveTipoPagina({ tipo: 'builtin', slug: 'menu' })).toBe('carta');
    expect(claveTipoPagina({ tipo: 'builtin', slug: 'reservas-mesa' })).toBe('reservas');
    expect(esPaginaLegal({ tipo: 'builtin', slug: 'terminos' })).toBe(true);
    expect(esPlantillaTienda({ tipo: 'checkout', slug: 'x' })).toBe(true);
  });

  test('restaurante ofrece las plantillas de A/04b y «En blanco» al final', () => {
    const ids = plantillasParaGiro('restaurante').map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['inicio', 'carta', 'carta_qr', 'reservas', 'eventos', 'nosotros', 'sedes', 'legal']));
    expect(ids.at(-1)).toBe('en_blanco');
    expect(plantillasParaGiro('tienda').map((p) => p.id)).not.toContain('carta_qr');
  });

  test('todas las secciones de plantillas y páginas base existen en el catálogo del constructor', () => {
    const secciones = [
      ...PLANTILLAS_PAGINA.flatMap((p) => p.secciones),
      ...Object.values(PAGINAS_BASE_GIRO).flatMap((ps) => ps.flatMap((p) => p.secciones)),
    ];
    const faltan = secciones.filter((s) => !getSectionDefinition(s.tipo)).map((s) => s.tipo);
    expect([...new Set(faltan)]).toEqual([]);
  });

  test('páginas base = siembra real (`create_default_pages`, verificada el 2026-10-06) + legales', () => {
    expect(PAGINAS_BASE_GIRO.restaurante.map((p) => p.slug)).toEqual(['home', 'menu', 'domicilios', 'reservas-mesa', 'nosotros', 'contacto', 'galeria']);
    expect(PAGINAS_BASE_GIRO.hotel.map((p) => p.slug)).toEqual(['home', 'espacios', 'servicios', 'galeria', 'nosotros', 'contacto']);
    expect(PAGINAS_BASE_GIRO.tienda.map((p) => p.slug)).toEqual(['home', 'productos', 'categorias', 'ofertas', 'nosotros', 'contacto']);
    expect(PAGINAS_BASE_GIRO.transporte.map((p) => p.slug)).toContain('rutas');
    expect(PAGINAS_BASE_GIRO.parqueadero.map((p) => p.slug)).toContain('tarifas');
    expect(paginasBasePorGiro('hotel').slice(-2).map((p) => p.slug)).toEqual(['terminos', 'privacidad']);
    expect(giroDeTipoOrganizacion(6)).toBe('transporte');
    expect(giroDeTipoOrganizacion(null)).toBe('tienda');
  });

  test('slugs', () => {
    expect(slugDesdeTexto('Política de Privacidad!')).toBe('politica-de-privacidad');
    expect(slugLibre('carta', new Set(['carta', 'carta-2']))).toBe('carta-3');
  });
});

describe('fechas y parámetros', () => {
  const ahora = new Date('2026-10-06T20:00:00Z'); // 3:00 p. m. en Bogotá

  test('Hoy, Ayer y fecha corta en la zona de la organización', () => {
    const hoy = fechaRelativa('2026-10-06T15:12:00Z', 'America/Bogota', ahora, 'es-CO');
    expect(hoy.tipo).toBe('hoy');
    // 04:30 UTC del 6 es el 5 en Bogotá: «Ayer», no «Hoy».
    expect(fechaRelativa('2026-10-06T04:30:00Z', 'America/Bogota', ahora, 'es-CO').tipo).toBe('ayer');
    const vieja = fechaRelativa('2026-10-02T15:00:00Z', 'America/Bogota', ahora, 'es-CO');
    expect(vieja.tipo === 'fecha' && vieja.texto).toMatch(/2/);
    expect(fechaRelativa(null, 'America/Bogota', ahora, 'es-CO').tipo).toBe('sin');
  });

  test('parámetros de la API', () => {
    expect(sitioDeParametro('principal')).toBeNull();
    expect(sitioDeParametro('12')).toBe(12);
    expect(sitioDeParametro('1;drop')).toBe('invalido');
    expect(sitioDeCuerpo(3)).toBe(3);
    expect(sitioDeCuerpo('3')).toBe('invalido');
    expect(versionDeCuerpo(null)).toBeNull();
    expect(versionDeCuerpo(0)).toBe('invalido');
    expect(esIdPagina('3f0c-ab_1')).toBe(true);
    expect(esIdPagina('../x')).toBe(false);
  });
});
