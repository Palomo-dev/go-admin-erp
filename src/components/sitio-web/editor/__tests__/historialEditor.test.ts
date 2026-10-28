import { historialVacio, MAX_PASOS, raicesCambiadas, registrar, reponerRaices, sacarParaDeshacer, sacarParaRehacer, valoresPrevios } from '../historialEditor';

describe('historialEditor (Deshacer del Encabezado, QA ROJO 28-oct)', () => {
  it('anota ajustes con los valores de antes (ausente = null)', () => {
    const antes = valoresPrevios({ header_icons_box: { shape: 'circle' }, search_style: 'bar' }, { search_style: 'icon' });
    expect(antes).toEqual({ header_icons_box: null, search_style: 'icon' });
  });
  it('copia los objetos: cambiar el original no cambia lo anotado', () => {
    const caja = { shape: 'circle' };
    const antes = valoresPrevios({ header_icons_box: 1 }, { header_icons_box: caja });
    caja.shape = 'none';
    expect(antes.header_icons_box).toEqual({ shape: 'circle' });
  });
  it('deshace y rehace en orden mezclando secciones y ajustes; anotar borra el futuro', () => {
    let h = registrar(historialVacio(), { tipo: 'secciones' });
    h = registrar(h, { tipo: 'ajustes', antes: { search_style: 'icon' }, despues: { search_style: 'bar' } });
    const d1 = sacarParaDeshacer(h);
    expect(d1.entrada?.tipo).toBe('ajustes');
    const d2 = sacarParaDeshacer(d1.historial);
    expect(d2.entrada?.tipo).toBe('secciones');
    expect(sacarParaDeshacer(d2.historial).entrada).toBeNull();
    const r1 = sacarParaRehacer(d2.historial);
    expect(r1.entrada?.tipo).toBe('secciones');
    expect(registrar(r1.historial, { tipo: 'secciones' }).futuro).toHaveLength(0);
  });
  it('limita a MAX_PASOS', () => {
    let h = historialVacio();
    for (let i = 0; i < MAX_PASOS + 5; i++) h = registrar(h, { tipo: 'secciones' });
    expect(h.pasado).toHaveLength(MAX_PASOS);
  });
  it('documento: solo repone las raíces que cambiaron', () => {
    const shell = { a: 1 };
    const paginas = [{ id: 'p' }];
    const doc = { shell, paginas, menus: [] as unknown[] };
    const nuevo = { ...doc, menus: [{ id: 'm' }] };
    const r = raicesCambiadas(doc, nuevo);
    expect(Object.keys(r.antes)).toEqual(['menus']);
    const conOtraPagina = { ...nuevo, paginas: [{ id: 'q' }] };
    const deshecho = reponerRaices(conOtraPagina, r.antes);
    expect(deshecho.menus).toEqual([]);
    expect(deshecho.paginas).toEqual([{ id: 'q' }]);
  });
});
