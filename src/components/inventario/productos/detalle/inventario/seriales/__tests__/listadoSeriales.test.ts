import {
  buscarSerialExacto,
  categoriaGarantia,
  celdaCsv,
  construirCsv,
  cupoEn,
  claveStock,
  filtrarSeriales,
  FILTROS_VACIOS,
  nombreArchivoCsv,
  repetidosEnLista,
  serialesOcupando,
  siguienteSecuencia,
  totalSinSerial,
  type FilaSerial,
} from '../listadoSeriales';

const HOY = '2026-09-24';

function fila(p: Partial<FilaSerial> & { id: number; serial: string }): FilaSerial {
  return {
    product_id: 1,
    status: 'in_stock',
    branch_id: 10,
    current_branch_id: 10,
    sold_to_customer_id: null,
    sale_date: null,
    warranty_start: null,
    warranty_end: null,
    warranty_months: null,
    cost_at_purchase: 100,
    price_at_sale: null,
    received_date: '2026-09-01T15:00:00Z',
    created_at: '2026-09-01T15:00:00Z',
    cliente: null,
    sucursal: 'Principal',
    ...p,
  };
}

const FILAS: FilaSerial[] = [
  fila({ id: 1, serial: 'ZAP-2026-0001' }),
  fila({ id: 2, serial: 'ZAP-2026-0002', status: 'reserved', current_branch_id: 20 }),
  fila({ id: 3, serial: 'ZAP-2026-0003', status: 'sold', warranty_end: '2026-10-10' }),
  fila({ id: 4, serial: 'ZAP-2026-0004', status: 'sold', warranty_end: '2027-09-24' }),
  fila({ id: 5, serial: 'ZAP-2026-0005', status: 'sold', warranty_end: '2026-09-01' }),
  fila({ id: 6, serial: 'VAR-0001', product_id: 2, status: 'damaged' }),
];

describe('categoriaGarantia', () => {
  it('distingue vigente, por vencer (≤ 30 días), vencida y sin garantía', () => {
    expect(categoriaGarantia(null, HOY)).toBe('sin_garantia');
    expect(categoriaGarantia('2026-10-24', HOY)).toBe('por_vencer');
    expect(categoriaGarantia('2026-10-25', HOY)).toBe('vigente');
    expect(categoriaGarantia(HOY, HOY)).toBe('por_vencer');
    expect(categoriaGarantia('2026-09-23', HOY)).toBe('vencida');
  });
});

describe('filtrarSeriales', () => {
  it('sin filtros devuelve todo', () => {
    expect(filtrarSeriales(FILAS, FILTROS_VACIOS, HOY)).toHaveLength(6);
  });
  it('texto sin distinguir mayúsculas, estado, sucursal y variante', () => {
    expect(filtrarSeriales(FILAS, { ...FILTROS_VACIOS, texto: ' zap-2026-000 ' }, HOY)).toHaveLength(5);
    expect(filtrarSeriales(FILAS, { ...FILTROS_VACIOS, estado: 'sold' }, HOY).map((f) => f.id)).toEqual([3, 4, 5]);
    expect(filtrarSeriales(FILAS, { ...FILTROS_VACIOS, sucursal: 20 }, HOY).map((f) => f.id)).toEqual([2]);
    expect(filtrarSeriales(FILAS, { ...FILTROS_VACIOS, variante: 2 }, HOY).map((f) => f.id)).toEqual([6]);
  });
  it('«vigente» incluye las por vencer; las demás categorías son exactas', () => {
    expect(filtrarSeriales(FILAS, { ...FILTROS_VACIOS, garantia: 'vigente' }, HOY).map((f) => f.id)).toEqual([3, 4]);
    expect(filtrarSeriales(FILAS, { ...FILTROS_VACIOS, garantia: 'por_vencer' }, HOY).map((f) => f.id)).toEqual([3]);
    expect(filtrarSeriales(FILAS, { ...FILTROS_VACIOS, garantia: 'vencida' }, HOY).map((f) => f.id)).toEqual([5]);
    expect(filtrarSeriales(FILAS, { ...FILTROS_VACIOS, garantia: 'sin_garantia' }, HOY).map((f) => f.id)).toEqual([1, 2, 6]);
  });
});

describe('buscarSerialExacto', () => {
  it('encuentra el serial idéntico (lectura de escáner) y no uno parcial', () => {
    expect(buscarSerialExacto(FILAS, 'zap-2026-0003\n')?.id).toBe(3);
    expect(buscarSerialExacto(FILAS, 'ZAP-2026')).toBeNull();
    expect(buscarSerialExacto(FILAS, '   ')).toBeNull();
  });
});

describe('cupo por sucursal', () => {
  const stock = new Map<string, number>([
    [claveStock(1, 10), 6],
    [claveStock(1, 20), 1],
    [claveStock(2, 10), 0.5],
  ]);
  const ocupando = serialesOcupando(FILAS);

  it('solo cuenta en stock o reservados, por producto y sucursal', () => {
    expect(ocupando.get(claveStock(1, 10))).toBe(1);
    expect(ocupando.get(claveStock(1, 20))).toBe(1);
    expect(ocupando.get(claveStock(2, 10))).toBeUndefined();
  });
  it('cupo = piso(stock) − ocupando, nunca negativo', () => {
    expect(cupoEn(stock, ocupando, 1, 10)).toBe(5);
    expect(cupoEn(stock, ocupando, 1, 20)).toBe(0);
    expect(cupoEn(stock, ocupando, 2, 10)).toBe(0);
    expect(cupoEn(stock, ocupando, 3, 10)).toBe(0);
    expect(totalSinSerial(stock, ocupando)).toBe(5);
  });
  it('el consecutivo sigue al conteo del producto (como el servidor)', () => {
    expect(siguienteSecuencia(FILAS, 1)).toBe(6);
    expect(siguienteSecuencia(FILAS, 2)).toBe(2);
    expect(siguienteSecuencia(FILAS, 9)).toBe(1);
  });
});

describe('lista pegada', () => {
  it('cuenta repetidos antes de quitarlos', () => {
    expect(repetidosEnLista('A\nB, A;C\tB\n\n')).toBe(2);
    expect(repetidosEnLista('')).toBe(0);
  });
});

describe('CSV', () => {
  it('escapa comillas y neutraliza fórmulas', () => {
    expect(celdaCsv('a"b')).toBe('"a""b"');
    expect(celdaCsv('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(celdaCsv(-5)).toBe('"-5"');
    expect(celdaCsv(null)).toBe('""');
  });
  it('arma el archivo con BOM y CRLF', () => {
    const csv = construirCsv(['Serial', 'Estado'], [['S1', 'En stock']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('"Serial","Estado"\r\n"S1","En stock"');
  });
  it('nombre de archivo sin caracteres raros', () => {
    expect(nombreArchivoCsv('ZAP 42/A', 7, HOY)).toBe('seriales_ZAP_42_A_2026-09-24.csv');
    expect(nombreArchivoCsv('', 7, HOY)).toBe('seriales_7_2026-09-24.csv');
  });
});
