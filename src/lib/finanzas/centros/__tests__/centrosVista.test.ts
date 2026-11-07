/**
 * Centros de costo en pantalla: árbol, filtros, padres sin ciclo y
 * distribuciones que suman 100 %. Datos inventados.
 */
import {
  descendientesYPropio,
  errorGuardarCentro,
  errorRpcDistribucion,
  filasCentros,
  resumenDistribucion,
  sumaDistribucion,
  validarDistribucion,
  type CentroVista,
} from '../centrosVista';

const C = (id: string, code: string, name: string, parent: string | null, extra: Partial<CentroVista> = {}): CentroVista => ({
  id,
  code,
  name,
  parent_id: parent,
  branch_id: null,
  is_active: true,
  ...extra,
});

const CENTROS = [
  C('b', '200', 'Ventas', null, { branch_id: 1 }),
  C('a', '100', 'Administración', null),
  C('a2', '120', 'Contabilidad', 'a'),
  C('a1', '110', 'Gerencia', 'a'),
  C('b2', '220', 'Domicilios', 'b', { branch_id: 1, is_active: false }),
  C('b1', '210', 'Mostrador', 'b', { branch_id: 1 }),
];

const sinFiltros = { busqueda: '', estado: 'todos' as const, sucursal: null, cerrados: new Set<string>() };

describe('filasCentros', () => {
  it('ordena por código y abre todo por defecto, como el Figma', () => {
    const filas = filasCentros(CENTROS, sinFiltros);
    expect(filas.map((f) => f.centro.code)).toEqual(['100', '110', '120', '200', '210', '220']);
    expect(filas.map((f) => f.nivel)).toEqual([0, 1, 1, 0, 1, 1]);
    expect(filas[0]).toMatchObject({ tieneHijos: true, abierto: true, contexto: false });
  });

  it('una rama cerrada a mano oculta sus hijos', () => {
    const filas = filasCentros(CENTROS, { ...sinFiltros, cerrados: new Set(['a']) });
    expect(filas.map((f) => f.centro.code)).toEqual(['100', '200', '210', '220']);
  });

  it('la búsqueda conserva el padre como contexto', () => {
    const filas = filasCentros(CENTROS, { ...sinFiltros, busqueda: 'mostra' });
    expect(filas.map((f) => [f.centro.code, f.contexto])).toEqual([['200', true], ['210', false]]);
  });

  it('filtra por estado y por sucursal (0 = toda la organización)', () => {
    expect(filasCentros(CENTROS, { ...sinFiltros, estado: 'inactivos' }).map((f) => f.centro.code)).toEqual(['200', '220']);
    expect(filasCentros(CENTROS, { ...sinFiltros, sucursal: 0 }).map((f) => f.centro.code)).toEqual(['100', '110', '120']);
  });
});

describe('descendientesYPropio', () => {
  it('excluye al centro y a toda su rama como padre posible', () => {
    expect([...descendientesYPropio(CENTROS, 'a')].sort()).toEqual(['a', 'a1', 'a2']);
    expect([...descendientesYPropio(CENTROS, 'b1')]).toEqual(['b1']);
  });
});

describe('distribución', () => {
  const l = (centroId: string, porcentaje: string) => ({ centroId, porcentaje });

  it('acepta 60 + 40 y admite coma decimal', () => {
    expect(validarDistribucion('Gastos compartidos', [l('b1', '60'), l('b2', '40')])).toBeNull();
    expect(sumaDistribucion([l('b1', '33,3'), l('b2', '66,7')])).toBe(100);
  });

  it('rechaza nombre vacío, una sola línea, línea incompleta, repetidos y suma distinta de 100', () => {
    expect(validarDistribucion(' ', [l('b1', '60'), l('b2', '40')])).toBe('nombre');
    expect(validarDistribucion('X', [l('b1', '100')])).toBe('minimo');
    expect(validarDistribucion('X', [l('', '60'), l('b2', '40')])).toBe('linea');
    expect(validarDistribucion('X', [l('b1', '0'), l('b2', '100')])).toBe('linea');
    expect(validarDistribucion('X', [l('b1', '50'), l('b1', '50')])).toBe('repetido');
    expect(validarDistribucion('X', [l('b1', '60'), l('b2', '30')])).toBe('suma');
  });

  it('traduce los códigos de la RPC', () => {
    expect(errorRpcDistribucion('NOMBRE_REPETIDO')).toBe('nombreRepetido');
    expect(errorRpcDistribucion('CENTRO_INVALIDO')).toBe('centroInvalido');
    expect(errorRpcDistribucion('otro')).toBe('desconocido');
  });

  it('resume el reparto con el nombre de cada centro', () => {
    const texto = resumenDistribucion(
      [{ cost_center_id: 'b1', porcentaje: 60 }, { cost_center_id: 'b2', porcentaje: 40 }],
      CENTROS,
      (n) => `${n} %`,
    );
    expect(texto).toBe('Mostrador 60 % · Domicilios 40 %');
  });
});

describe('errorGuardarCentro', () => {
  it('reconoce ciclo, código repetido y centro con movimientos', () => {
    expect(errorGuardarCentro('CENTRO_CICLO')).toBe('ciclo');
    expect(errorGuardarCentro('duplicate key value violates unique constraint')).toBe('codigoRepetido');
    expect(errorGuardarCentro('centro_con_movimientos')).toBe('conMovimientos');
  });
});
