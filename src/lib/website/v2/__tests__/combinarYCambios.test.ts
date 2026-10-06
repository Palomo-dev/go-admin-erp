/**
 * Conflicto «otra persona publicó» (A/05i): combinación a tres vías por sección, y la lista de
 * cambios del diálogo Publicar (A/05g). Datos ficticios.
 */
import { validarDocumentoSitio, type DocumentoSitio, type SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import { combinarDocumentos } from '../combinarDocumentos';
import { listarCambios } from '../cambiosPublicacion';

function sec(id: string, tipo: string, contenido: Record<string, unknown> = {}, variante: string | null = null): SeccionSitio {
  return { id, tipo, variante, version: 1, contenido, diseno: {}, visibilidad: { movil: true, escritorio: true } };
}

function doc(secciones: SeccionSitio[], acento = '#C8A97E'): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    tema: { colores: { primario: { mode: 'value', value: acento } }, tipografia: {} },
    shell: {
      header: { composicion: 'default', menuPrincipalId: null, opciones: {} },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [],
    paginas: [{ id: 'p1', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const base = doc([sec('a', 'hero', { t: 1 }), sec('b', 'menu_preview', {}, 'tabs'), sec('c', 'gallery')]);

describe('combinarDocumentos', () => {
  test('cambios en secciones distintas se combinan sin choques', () => {
    const servidor = doc([sec('a', 'hero', { t: 2 }), sec('b', 'menu_preview', {}, 'tabs'), sec('c', 'gallery')]);
    const local = doc([sec('a', 'hero', { t: 1 }), sec('b', 'menu_preview', {}, 'anchors'), sec('c', 'gallery'), sec('d', 'events')], '#8C6A3F');
    const r = combinarDocumentos(base, servidor, local);
    expect(r.choques).toEqual([]);
    const s = r.documento.paginas[0].secciones;
    expect(s.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(s[0].contenido).toEqual({ t: 2 });
    expect(s[1].variante).toBe('anchors');
    expect(r.documento.tema.colores.primario).toEqual({ mode: 'value', value: '#8C6A3F' });
    expect(validarDocumentoSitio(r.documento).ok).toBe(true);
  });

  test('la misma sección cambiada por los dos es un choque; se resuelve con la elección', () => {
    const servidor = doc([sec('a', 'hero', { t: 2 }), sec('b', 'menu_preview', {}, 'tabs'), sec('c', 'gallery')]);
    const local = doc([sec('a', 'hero', { t: 3 }), sec('b', 'menu_preview', {}, 'tabs'), sec('c', 'gallery')]);
    const r = combinarDocumentos(base, servidor, local);
    expect(r.choques).toEqual([{ clave: 'seccion:p1/a', tipo: 'seccion', paginaId: 'p1', titulo: 'Inicio', seccionId: 'a', seccionTipo: 'hero' }]);
    expect(r.documento.paginas[0].secciones[0].contenido).toEqual({ t: 3 });
    const suya = combinarDocumentos(base, servidor, local, { 'seccion:p1/a': 'suya' });
    expect(suya.documento.paginas[0].secciones[0].contenido).toEqual({ t: 2 });
  });

  test('una sección quitada por el servidor y no tocada por mí se va; reordenar solo de un lado gana', () => {
    const servidor = doc([sec('a', 'hero', { t: 1 }), sec('b', 'menu_preview', {}, 'tabs')]);
    const local = doc([sec('c', 'gallery'), sec('a', 'hero', { t: 1 }), sec('b', 'menu_preview', {}, 'tabs')]);
    const r = combinarDocumentos(base, servidor, local);
    expect(r.choques).toEqual([]);
    expect(r.documento.paginas[0].secciones.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('listarCambios', () => {
  test('detalla sección editada (variante), sección nueva y colores del tema', () => {
    const borrador = doc([sec('a', 'hero', { t: 1 }), sec('b', 'menu_preview', { cats: [1, 2] }, 'anchors'), sec('c', 'gallery'), sec('d', 'events')], '#8C6A3F');
    const cambios = listarCambios(borrador, base);
    expect(cambios).toEqual([
      {
        tipo: 'seccion',
        accion: 'editada',
        paginaId: 'p1',
        pagina: 'Inicio',
        seccionId: 'b',
        seccionTipo: 'menu_preview',
        detalle: { variante: { antes: 'tabs', despues: 'anchors' }, contenido: true, estilo: false, visibilidad: false },
      },
      { tipo: 'seccion', accion: 'nueva', paginaId: 'p1', pagina: 'Inicio', seccionId: 'd', seccionTipo: 'events' },
      { tipo: 'tema', colores: [{ rol: 'primario', antes: '#C8A97E', despues: '#8C6A3F' }], tipografia: false, otros: false },
    ]);
  });

  test('sin cambios no hay nada que publicar; nunca publicado = página nueva', () => {
    expect(listarCambios(base, base)).toEqual([]);
    expect(listarCambios(base, null)[0]).toEqual({ tipo: 'pagina', accion: 'nueva', paginaId: 'p1', pagina: 'Inicio' });
  });
});
