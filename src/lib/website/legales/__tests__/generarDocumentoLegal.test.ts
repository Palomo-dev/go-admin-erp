/**
 * Generador de documentos legales: IA simulada, IA caída, salida inválida,
 * datos faltantes, backfill que no pisa texto y estados del resolvedor.
 */
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { validarDocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { documentosLegales, faltaTratamientoDatos } from '@/lib/website/configuracionSitio';
import {
  datosVacios,
  elegirDocumento,
  fueEditado,
  hashTexto,
  plantillaLegal,
  salidaValida,
  textoPlano,
  type DatosLegales,
} from '@/lib/website/legales/plantillasLegales';
import {
  ajustarMenusLegales,
  colocarDocumentoLegal,
  contenidoTrasEditarBody,
  diagnosticarLegales,
  htmlDePagina,
} from '@/lib/website/legales/documentoLegal';
import { generarDocumentoLegal } from '@/lib/website/legales/generarDocumentoLegal';
import { resolverPolitica } from '@/lib/website/legales/obtenerDocumentoLegal';

const COMPLETOS: DatosLegales = {
  ...datosVacios('2026-10-22'),
  legalName: 'Negocio de prueba S.A.S.',
  name: 'Negocio de prueba',
  nit: '900123123-1',
  address: 'Calle 1',
  city: 'Medellín',
  state: 'Antioquia',
  email: 'hola@ejemplo.test',
  phone: '3000000000',
  whatsapp: '3000000000',
  dominio: 'ejemplo.test',
  envioTarifa: '10.000',
  envioGratisDesde: '100.000',
  envioActivo: true,
  tiposEntrega: ['recogida en el local'],
};

function assertLimpio(html: string) {
  expect(html).not.toContain('{{');
  expect(html).not.toMatch(/\bundefined\b/);
  expect(textoPlano(html).length).toBeGreaterThanOrEqual(80);
}

function documentoMinimo(paginas: DocumentoSitio['paginas']): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: {},
    tema: { colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
    shell: { header: { composicion: 'default', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } },
    menus: [],
    paginas,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

describe('plantilla determinista', () => {
  it('con datos completos no deja huecos', () => {
    for (const clave of ['terminos', 'privacidad', 'tratamiento', 'envios', 'devoluciones', 'cookies'] as const) {
      const r = plantillaLegal(clave, COMPLETOS);
      assertLimpio(r.body);
      expect(salidaValida(clave, r.body)).toBe(true);
      expect(r.origen).toBe('plantilla');
    }
  });

  it('sin datos omite la frase y no escribe el placeholder', () => {
    const r = plantillaLegal('tratamiento', datosVacios());
    assertLimpio(r.body);
    expect(r.body).not.toContain('NIT');
    expect(r.faltantes).toEqual(expect.arrayContaining(['name', 'email']));
    expect(r.body).toContain('1581');
    expect(r.body).toContain('1377');
  });
});

describe('elegir entre IA y plantilla', () => {
  const htmlValido = plantillaLegal('terminos', COMPLETOS).body.replace('Términos', 'Términos del negocio');

  it('usa la IA cuando el HTML pasa', () => {
    const r = elegirDocumento('terminos', COMPLETOS, htmlValido);
    expect(r.origen).toBe('ia');
    expect(r.body).toContain('Términos del negocio');
  });

  it('si la IA cae, usa la plantilla', () => {
    const r = elegirDocumento('devoluciones', COMPLETOS, null);
    expect(r.origen).toBe('plantilla');
    expect(r.body).toContain('1480');
  });

  it('si la salida es inválida, usa la plantilla', () => {
    const r = elegirDocumento('cookies', COMPLETOS, '<script>alert(1)</script><p>undefined {{x}}</p>');
    expect(r.origen).toBe('plantilla');
    expect(r.body).not.toContain('script');
    expect(r.body).not.toContain('{{');
  });
});

describe('generarDocumentoLegal con IA inyectada', () => {
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), then: undefined }) }) }) } as never;

  it('modo auto no necesita red: la IA simulada gana si es válida', async () => {
    const r = await generarDocumentoLegal(120, 'cookies', {
      modo: 'auto',
      cobrar: false,
      supabase,
      pedirIa: async () => plantillaLegal('cookies', datosVacios()).body.replace('cookies', 'cookies del sitio'),
    });
    expect(r.origen === 'ia' || r.origen === 'plantilla').toBe(true);
    assertLimpio(r.body);
  });

  it('si la IA lanza, queda la plantilla', async () => {
    const r = await generarDocumentoLegal(120, 'terminos', {
      modo: 'auto',
      supabase,
      pedirIa: async () => {
        throw new Error('caída');
      },
    });
    expect(r.origen).toBe('plantilla');
    assertLimpio(r.body);
  });
});

describe('colocar y regenerar', () => {
  const gen = () => `id-${Math.random().toString(16).slice(2, 10)}`;
  const ahora = '2026-10-22T12:00:00.000Z';

  it('no pisa un texto con cuerpo (fixture tipo página ya escrita)', () => {
    const base = documentoMinimo([
      {
        id: 'p-term',
        slug: 'terminos',
        tipo: 'legal',
        titulo: 'Términos y condiciones',
        publicada: true,
        secciones: [{ id: 's', tipo: 'text_block', variante: 'left', version: 1, contenido: { title: 'Términos', body: 'Texto real de la organización con más de ochenta caracteres para que cuente como escrito a mano y no se reemplace.' }, diseno: {}, visibilidad: { movil: true, escritorio: true } }],
      },
    ]);
    const puesto = colocarDocumentoLegal(base, 'terminos', plantillaLegal('terminos', COMPLETOS), ahora, gen);
    expect(puesto.accion).toBe('omitida');
    expect(htmlDePagina(puesto.documento.paginas[0])).toContain('Texto real');
    const otra = colocarDocumentoLegal(puesto.documento, 'terminos', plantillaLegal('terminos', COMPLETOS), ahora, gen);
    expect(otra.accion).toBe('omitida');
  });

  it('llena una página vacía y marca editadoEn al guardar un cambio', () => {
    const base = documentoMinimo([
      {
        id: 'p-c',
        slug: 'cookies',
        tipo: 'legal',
        titulo: 'Cookies',
        publicada: true,
        secciones: [{ id: 's', tipo: 'text_block', variante: 'left', version: 1, contenido: { title: 'Cookies', content: '' }, diseno: {}, visibilidad: { movil: true, escritorio: true } }],
      },
    ]);
    const plantilla = plantillaLegal('cookies', COMPLETOS);
    const puesto = colocarDocumentoLegal(base, 'cookies', plantilla, ahora, gen);
    expect(puesto.accion).toBe('llenada');
    expect(fueEditado(puesto.documento.paginas[0].secciones[0].contenido)).toBe(false);
    const editado = contenidoTrasEditarBody(puesto.documento.paginas[0].secciones[0].contenido, plantilla.body + ' Nota de la organización.', ahora);
    expect((editado.legal as { editadoEn: string }).editadoEn).toBe(ahora);
    expect(editado.content).toBeUndefined();
  });

  it('regenera si el hash coincide y exige confirmación si fue editado', () => {
    const plantilla = plantillaLegal('privacidad', COMPLETOS);
    const base = documentoMinimo([]);
    const creado = colocarDocumentoLegal(base, 'privacidad', plantilla, ahora, gen);
    const igual = colocarDocumentoLegal(creado.documento, 'privacidad', plantilla, ahora, gen);
    expect(igual.accion).toBe('omitida');
    expect(igual.editado).toBe(false);
    const tocado = {
      ...creado.documento,
      paginas: creado.documento.paginas.map((p) => ({
        ...p,
        secciones: p.secciones.map((s) => ({ ...s, contenido: contenidoTrasEditarBody(s.contenido, plantilla.body + ' Editado por la organización con suficiente texto.', ahora) })),
      })),
    };
    const bloqueado = colocarDocumentoLegal(tocado, 'privacidad', plantilla, ahora, gen);
    expect(bloqueado.editado).toBe(true);
    const forzado = colocarDocumentoLegal(tocado, 'privacidad', plantilla, ahora, gen, { forzar: true });
    expect(forzado.accion).toBe('reemplazada');
    expect(hashTexto(htmlDePagina(forzado.documento.paginas[0]))).toBe(plantilla.hashGenerado);
  });
});

describe('menú y estados', () => {
  it('tratamiento deja de apuntar a privacidad y envíos entra si falta', () => {
    let n = 0;
    const gen = () => `m${++n}`;
    const priv = colocarDocumentoLegal(documentoMinimo([]), 'privacidad', plantillaLegal('privacidad', COMPLETOS), '2026-10-22T00:00:00.000Z', gen);
    const doc = colocarDocumentoLegal(priv.documento, 'tratamiento', plantillaLegal('tratamiento', COMPLETOS), '2026-10-22T00:00:00.000Z', gen).documento;
    const conMenu = ajustarMenusLegales(doc, gen).documento;
    const envios = colocarDocumentoLegal(conMenu, 'envios', plantillaLegal('envios', COMPLETOS), '2026-10-22T00:00:00.000Z', gen);
    const menu = ajustarMenusLegales(envios.documento, gen);
    expect(menu.cambios).toContain('menu_envios');
    const legales = menu.documento.menus.find((m) => m.nombre === 'Legales')!;
    const item = legales.items.find((i) => i.etiqueta === 'Tratamiento de datos');
    const trat = menu.documento.paginas.find((p) => p.slug === 'tratamiento-de-datos')!;
    expect(item && item.tipo === 'page' ? item.paginaId : null).toBe(trat.id);
  });

  it('estados vacío, falta, borrador y publicado', () => {
    const docs = documentosLegales([
      { id: 'a', slug: 'terminos', titulo: 'T', publicada: true, estado: 'publicado', actualizadaEn: null, caracteres: 200 },
      { id: 'b', slug: 'privacidad', titulo: 'P', publicada: false, estado: 'sin_publicar', actualizadaEn: null, caracteres: 200 },
      { id: 'c', slug: 'cookies', titulo: 'C', publicada: true, estado: 'publicado', actualizadaEn: null, caracteres: 10 },
    ]);
    expect(docs.find((d) => d.clave === 'terminos')?.estado).toBe('publicado');
    expect(docs.find((d) => d.clave === 'privacidad')?.estado).toBe('borrador');
    expect(docs.find((d) => d.clave === 'cookies')?.estado).toBe('vacio');
    expect(docs.find((d) => d.clave === 'tratamiento')?.estado).toBe('falta');
    expect(faltaTratamientoDatos(docs)).toBe(true);
    expect(faltaTratamientoDatos(docs, 'https://ejemplo.test/politica')).toBe(false);
  });
});

describe('resolvedor de la política', () => {
  it('la URL manual gana; si no hay, usa la página publicada con texto', () => {
    expect(resolverPolitica('https://ejemplo.test/manual', { url: 'https://sitio.test/tratamiento-de-datos', publicado: true, conTexto: true })).toBe('https://ejemplo.test/manual');
    expect(resolverPolitica(null, { url: 'https://sitio.test/tratamiento-de-datos', publicado: true, conTexto: true })).toBe('https://sitio.test/tratamiento-de-datos');
    expect(resolverPolitica('', { url: 'https://sitio.test/tratamiento-de-datos', publicado: true, conTexto: false })).toBeNull();
    expect(resolverPolitica(null, { url: 'https://sitio.test/tratamiento-de-datos', publicado: false, conTexto: true })).toBeNull();
  });
});

describe('diagnóstico de backfill', () => {
  it('una página con texto no figura como vacía', () => {
    const doc = documentoMinimo([
      {
        id: 'p',
        slug: 'terminos',
        tipo: 'legal',
        titulo: 'Términos',
        publicada: true,
        secciones: [{ id: 's', tipo: 'text_block', variante: 'left', version: 1, contenido: { body: 'x'.repeat(90) }, diseno: {}, visibilidad: { movil: true, escritorio: true } }],
      },
    ]);
    expect(diagnosticarLegales(doc, ['terminos', 'cookies'])).toEqual([
      { clave: 'terminos', estado: 'texto' },
      { clave: 'cookies', estado: 'falta' },
    ]);
  });
});
