import { avisosContrasteContador, contrasteContador, ESTILO_CONTADOR_INICIAL, leerEstiloContador, resolverEstiloContador, unidadesContador } from '../estiloContador';
import { quitarColumnasOpcionalesAusentes } from '../columnasOpcionales';
import { textoSobreAcento } from '../v2/tokensEstilo';

describe('estiloContador', () => {
  test('NULL, vacío, basura o JSON inválido = sin estilo (contador de siempre)', () => {
    for (const v of [null, undefined, {}, [], 'x', '{', 3, true]) expect(leerEstiloContador(v)).toBeNull();
  });
  test('rellena lo que falta con el estilo inicial y descarta valores inválidos', () => {
    const e = leerEstiloContador({ fondo: { tipo: 'degradado', desde: '#ff0000', hasta: 'rojo', angulo: -90 }, temporizador: { caja: 'pildora', etiquetas: 'si' } })!;
    expect(e.fondo).toEqual({ tipo: 'degradado', color: '', desde: '#ff0000', hasta: '', angulo: 270 });
    expect(e.temporizador.caja).toBe('pildora');
    expect(e.temporizador.etiquetas).toBe(false);
    expect(e.icono).toEqual(ESTILO_CONTADOR_INICIAL.icono);
    expect(leerEstiloContador(JSON.stringify({ tamano: 'grande' }))!.tamano).toBe('grande');
  });
  test('resuelve fondo y color automático por contraste', () => {
    const claro = resolverEstiloContador(ESTILO_CONTADOR_INICIAL, '#A0D241', textoSobreAcento);
    expect(claro.fondo).toBe('#A0D241');
    expect(claro.colorTexto).toBe('#111111');
    const deg = resolverEstiloContador(leerEstiloContador({ fondo: { tipo: 'degradado', desde: '#1E3A8A', hasta: '#9333EA', angulo: 135 } })!, '#A0D241', textoSobreAcento);
    expect(deg.fondo).toBe('linear-gradient(135deg, #1E3A8A, #9333EA)');
    expect(deg.colorTexto).toBe('#FFFFFF');
    const propio = resolverEstiloContador(leerEstiloContador({ texto: { color: '#ff00aa' }, temporizador: { caja: 'ninguna', colorDigitos: '#000000' } })!, '#000', textoSobreAcento);
    expect(propio.colorTexto).toBe('#ff00aa');
    expect(propio.colorDigitos).toBe('#000000');
    expect(propio.conCaja).toBe(false);
  });
  test('degradado: el automático mira AMBOS colores (mejor contraste mínimo)', () => {
    // Gris → casi negro: con solo «desde» saldría negro, que sobre #111827 no se lee.
    const e = leerEstiloContador({ fondo: { tipo: 'degradado', desde: '#9CA3AF', hasta: '#111827', angulo: 90 } })!;
    const c = resolverEstiloContador(e, '#A0D241', textoSobreAcento).colorTexto;
    const min = (x: string) => Math.min(contrasteContador(x, '#9CA3AF'), contrasteContador(x, '#111827'));
    expect(min(c)).toBeGreaterThanOrEqual(Math.max(min('#111111'), min('#FFFFFF')) - 1e-9);
    expect(c).toBe('#FFFFFF');
  });
  test('contraste: avisa solo con colores propios bajo 4.5:1', () => {
    expect(contrasteContador('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(avisosContrasteContador(ESTILO_CONTADOR_INICIAL, '#A0D241', textoSobreAcento)).toEqual([]);
    const e = leerEstiloContador({ fondo: { tipo: 'degradado', desde: '#FFFFFF', hasta: '#000000' }, texto: { color: '#FFFFFF' }, temporizador: { caja: 'cuadrada', colorCaja: '#A0D241', colorDigitos: '#111111' } })!;
    expect(avisosContrasteContador(e, '#A0D241', textoSobreAcento)).toEqual(['texto']);
  });
  test('unidades: días solo con 24 h o más', () => {
    expect(unidadesContador(3725).map((u) => u.valor)).toEqual(['01', '02', '05']);
    expect(unidadesContador(90000).map((u) => u.etiqueta)).toEqual(['días', 'horas', 'min', 'seg']);
  });
  test('guardado tolerante: sin la columna se reintenta sin ella; otros errores no', () => {
    const err = { code: 'PGRST204', message: "Could not find the 'countdown_style' column of 'website_settings' in the schema cache" };
    expect(quitarColumnasOpcionalesAusentes({ countdown_style: {}, countdown_title: 'x' }, err)).toEqual({ countdown_title: 'x' });
    expect(quitarColumnasOpcionalesAusentes({ countdown_title: 'x' }, err)).toBeNull();
    expect(quitarColumnasOpcionalesAusentes({ countdown_style: {} }, { code: '42501', message: 'permiso' })).toBeNull();
  });
});
