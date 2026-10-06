/**
 * Estilo por sección (figma-estilo 01-10): lectura saneada, escritura, tamaños, visibilidad por
 * dispositivo, herencia por grupo en sedes y la ida y vuelta con el documento V2. Datos ficticios.
 */
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import {
  aplicarComparable,
  aplicarVisibilidad,
  alternarVisibleTodo,
  comparableDe,
  escalaDePx,
  escribirEstiloSeccion,
  estiloVacio,
  interlineadoNumero,
  leerEstiloSeccion,
  origenGruposEstilo,
  puedeOcultar,
  resolverEstiloSeccion,
  restablecerGrupoEstilo,
  tamanoEnPx,
  variablesCssSeccion,
  visibilidadAlDocumento,
  visibilidadDeSeccion,
  type EstiloSeccion,
} from '../estiloSeccion';
import { aplicarPaginaAlDocumento, paginaAVista } from '../vistaEditor';

const propia: EstiloSeccion = {
  v: 1,
  fondo: 'alterno',
  entrada: 'aparecer',
  tipografia: { modo: 'propia', titulo: { fuente: 'DM Serif Display', tamano: 'L', grosor: 700, interlineado: 'compacto', mayusculas: true } },
  colores: { texto: 'marca:texto', borde: 'marca:secundario' },
};

describe('lectura y escritura', () => {
  test('lee un estilo válido y descarta lo inválido', () => {
    const e = leerEstiloSeccion({
      padding: 'lg',
      estilo: {
        fondo: 'alterno',
        entrada: 'girar',
        tipografia: { modo: 'propia', titulo: { tamano: 500, grosor: 650, interlineado: 9, fuente: '' } },
        colores: { texto: 'rojo', borde: '#3a3a3a' },
      },
    });
    expect(e.fondo).toBe('alterno');
    expect(e.entrada).toBeUndefined();
    expect(e.tipografia).toEqual({ modo: 'propia', titulo: { tamano: 120, interlineado: 2.5 } });
    expect(e.colores).toEqual({ borde: '#3A3A3A' });
  });

  test('sin estilo = hereda todo; escribir vacío borra la clave sin tocar el resto', () => {
    expect(estiloVacio(leerEstiloSeccion({}))).toBe(true);
    const conEstilo = escribirEstiloSeccion({ padding: 'lg' }, propia);
    expect(conEstilo.padding).toBe('lg');
    expect((conEstilo.estilo as EstiloSeccion).fondo).toBe('alterno');
    const sinEstilo = escribirEstiloSeccion(conEstilo, { v: 1, tipografia: { modo: 'sitio' } });
    expect(sinEstilo).toEqual({ padding: 'lg' });
  });
});

describe('tipografía', () => {
  test('escala S/M/L/XL en computador y −20 % en celular', () => {
    expect(tamanoEnPx('L', 'titulo')).toBe(40);
    expect(tamanoEnPx('XL', 'titulo', 'celular')).toBe(38);
    expect(tamanoEnPx(40, 'titulo', 'celular')).toBe(32);
    expect(tamanoEnPx(undefined, 'titulo')).toBeNull();
    expect(escalaDePx(34, 'titulo')).toBe('M');
    expect(escalaDePx(35, 'titulo')).toBeNull();
    expect(interlineadoNumero('compacto')).toBe(1.1);
    expect(interlineadoNumero(1.25)).toBe(1.25);
  });

  test('resuelve fuentes y colores contra el tema; los colores de marca van como variable CSS', () => {
    const tema = { colores: { texto: '#F2EDE4', secundario: '#3A3A3A' }, fuentes: { titulos: 'Playfair Display', cuerpo: 'Inter' } };
    const r = resolverEstiloSeccion(propia, tema);
    expect(r).toEqual({ fuenteTitulo: 'DM Serif Display', fuenteTexto: 'Inter', colorTexto: '#F2EDE4', colorBorde: '#3A3A3A', propia: true });
    const vars = variablesCssSeccion(propia, 'celular');
    expect(vars['--seccion-tamano-titulo']).toBe('32px');
    expect(vars['--seccion-color-texto']).toBe('var(--text-color)');
    expect(vars['--seccion-espaciado-titulo']).toBe('0.04em');
  });
});

describe('visibilidad por dispositivo', () => {
  const base = { is_visible: true, settings: { padding: 'md' } as Record<string, unknown> };

  test('ocultar en celular deja settings.visibilidad; mostrar en todo la quita', () => {
    const oculta = aplicarVisibilidad(base, { computador: true, tableta: true, celular: false });
    expect(oculta.is_visible).toBe(true);
    expect(visibilidadDeSeccion(oculta)).toEqual({ computador: true, tableta: true, celular: false });
    const todo = alternarVisibleTodo(oculta, true);
    expect(todo.settings).toEqual({ padding: 'md' });
    expect(visibilidadDeSeccion(alternarVisibleTodo(oculta, false)).computador).toBe(false);
  });

  test('siempre queda al menos un dispositivo activo', () => {
    expect(puedeOcultar({ computador: true, tableta: false, celular: false }, 'computador')).toBe(false);
    expect(puedeOcultar({ computador: true, tableta: true, celular: false }, 'tableta')).toBe(true);
  });

  test('al documento: tableta solo cuando difiere del computador', () => {
    expect(visibilidadAlDocumento({ computador: true, tableta: true, celular: false })).toEqual({ escritorio: true, movil: false });
    expect(visibilidadAlDocumento({ computador: true, tableta: false, celular: true })).toEqual({ escritorio: true, movil: true, tableta: false });
  });

  test('ida y vuelta con el documento V2: estilo en diseno.estilo y tableta en visibilidad', () => {
    const r = validarDocumentoSitio({
      schemaVersion: 1,
      tema: { colores: {}, tipografia: {} },
      shell: {
        header: { composicion: 'default', menuPrincipalId: null, opciones: {} },
        footer: { composicion: 'default', menuIds: [], opciones: {} },
      },
      menus: [],
      paginas: [{ id: 'p1', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones: [{ id: 's1', tipo: 'menu_preview', variante: 'tabs', version: 1, contenido: {} }] }],
    });
    if (!r.ok) throw new Error('documento de prueba inválido');
    const doc: DocumentoSitio = r.documento;
    const vista = paginaAVista(doc.paginas[0], { organizationId: 120, branchId: null });
    let s = vista.sections[0];
    s = { ...s, settings: escribirEstiloSeccion(s.settings, propia) } as typeof s;
    s = aplicarVisibilidad(s, { computador: true, tableta: false, celular: true });
    vista.sections = [s];
    const resultado = aplicarPaginaAlDocumento(doc, vista);
    expect(validarDocumentoSitio(resultado).ok).toBe(true);
    const sec = resultado.paginas[0].secciones[0];
    expect(sec.visibilidad).toEqual({ escritorio: true, movil: true, tableta: false });
    expect((sec.diseno as Record<string, unknown>).visibilidad).toBeUndefined();
    expect(leerEstiloSeccion(sec.diseno).tipografia).toEqual(propia.tipografia);
    // Y de vuelta a la vista, la visibilidad fina reaparece.
    expect(visibilidadDeSeccion(paginaAVista(resultado.paginas[0], { organizationId: 120, branchId: null }).sections[0])).toEqual({
      computador: true,
      tableta: false,
      celular: true,
    });
  });
});

describe('herencia por grupo en una sede', () => {
  const principal = { is_visible: true, settings: { estilo: { v: 1, fondo: 'alterno', colores: { texto: 'marca:texto' } } } };

  test('igual al principal = heredado; cambiar un grupo lo vuelve personalizado solo a él', () => {
    const p = comparableDe(principal);
    expect(origenGruposEstilo(p, p)).toEqual({ tipografia: 'heredado', mostrar: 'heredado', colores: 'heredado', fondo: 'heredado' });
    const sede = aplicarVisibilidad(
      { ...principal, settings: escribirEstiloSeccion(principal.settings, { ...leerEstiloSeccion(principal.settings), tipografia: propia.tipografia }) },
      { computador: true, tableta: true, celular: false },
    );
    const origen = origenGruposEstilo(comparableDe(sede), p);
    expect(origen).toEqual({ tipografia: 'personalizado', mostrar: 'personalizado', colores: 'heredado', fondo: 'heredado' });

    const restablecida = aplicarComparable(sede, restablecerGrupoEstilo(comparableDe(sede), p, 'tipografia'));
    expect(origenGruposEstilo(comparableDe(restablecida), p).tipografia).toBe('heredado');
    expect(origenGruposEstilo(comparableDe(restablecida), p).mostrar).toBe('personalizado');
  });

  test('una sección nueva de la sede no hereda nada', () => {
    expect(origenGruposEstilo(comparableDe(principal), null).fondo).toBe('personalizado');
  });
});
