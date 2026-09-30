/**
 * Mapas de «De dónde entran»: agregación por país y por departamento, códigos
 * ISO, escala de color y las geometrías reales del repositorio (world-atlas y
 * departamentos de Colombia). Cifras inventadas.
 */
import type { Topology } from 'topojson-specification';
import mundoTopo from 'world-atlas/countries-110m.json';
import colombiaTopo from '@/components/analiticaWeb/mapas/geo/colombia-departamentos.topo.json';
import { formasColombia, formasMundo } from '@/components/analiticaWeb/mapas/geometrias';
import { dibujarColombia, dibujarMundo } from '@/components/analiticaWeb/mapas/proyeccion';
import {
  DEPARTAMENTOS_CO,
  PASOS_ESCALA,
  RELLENOS_ESCALA,
  agregarPorPais,
  agregarPorRegion,
  agregarRegiones,
  CIUDADES_POR_PAGINA,
  ciudadesParaTabla,
  codigoRegionIso,
  debeAbrirColombia,
  filtrarCiudadesPorRegion,
  nombreRegion,
  pasoEscala,
  rellenoPaso,
  valoresRegionMapa,
} from '../mapa';
import { ISO_NUMERICO_A_ALFA2, alfa2DesdeNumerico } from '../isoPaises';

describe('códigos ISO', () => {
  test('numérico → alfa-2 (con y sin ceros a la izquierda)', () => {
    expect(alfa2DesdeNumerico('170')).toBe('CO');
    expect(alfa2DesdeNumerico(840)).toBe('US');
    expect(alfa2DesdeNumerico('32')).toBe('AR');
    expect(alfa2DesdeNumerico('250')).toBe('FR');
    expect(alfa2DesdeNumerico('578')).toBe('NO');
    expect(alfa2DesdeNumerico('999')).toBeNull();
    expect(alfa2DesdeNumerico(undefined, 'Kosovo')).toBe('XK');
    expect(alfa2DesdeNumerico(undefined, 'Somaliland')).toBeNull();
  });

  test('la tabla no repite alfa-2', () => {
    const valores = Object.values(ISO_NUMERICO_A_ALFA2);
    expect(new Set(valores).size).toBe(valores.length);
    for (const v of valores) expect(v).toMatch(/^[A-Z]{2}$/);
  });

  test('region de website_visits → ISO 3166-2', () => {
    expect(codigoRegionIso('CO', 'ANT')).toBe('CO-ANT');
    expect(codigoRegionIso('co', ' dc ')).toBe('CO-DC');
    expect(codigoRegionIso('CO', 'CO-VAC')).toBe('CO-VAC');
    expect(codigoRegionIso('CO', 'BOG')).toBe('CO-DC');
    expect(codigoRegionIso('US', 'VA')).toBe('US-VA');
    expect(codigoRegionIso('CO', 'Antioquia')).toBeNull();
    expect(codigoRegionIso('CO', '')).toBeNull();
    expect(codigoRegionIso(null, 'ANT')).toBeNull();
    expect(nombreRegion('CO', 'RIS')).toBe('Risaralda');
    expect(nombreRegion('CO', 'DC')).toBe('Bogotá, D. C.');
    expect(nombreRegion('US', 'VA')).toBe('VA');
  });

  test('32 departamentos + Bogotá D. C.', () => {
    expect(DEPARTAMENTOS_CO).toHaveLength(33);
    expect(new Set(DEPARTAMENTOS_CO.map((d) => d.codigo)).size).toBe(33);
    expect(DEPARTAMENTOS_CO.map((d) => d.codigo)).toContain('CO-DC');
  });
});

describe('agregación', () => {
  test('por país: suma repetidos, ignora vacíos y calcula %', () => {
    const v = agregarPorPais([
      { pais: 'CO', visitantes: 60, sesiones: 90 },
      { pais: 'mx', visitantes: 30, sesiones: 40 },
      { pais: 'CO', visitantes: 10, sesiones: 10 },
      { pais: '', visitantes: 5, sesiones: 5 },
      { pais: 'US', visitantes: 0, sesiones: 0 },
    ]);
    expect([...v.keys()].sort()).toEqual(['CO', 'MX']);
    expect(v.get('CO')).toEqual({ codigo: 'CO', visitantes: 70, sesiones: 100, pct: 0.7 });
    expect(v.get('MX')?.pct).toBeCloseTo(0.3);
  });

  test('por región: desde las ciudades, con las sin región aparte', () => {
    const ciudades = [
      { ciudad: 'Medellín', region: 'ANT', visitantes: 40, sesiones: 50 },
      { ciudad: 'Envigado', region: 'ANT', visitantes: 10, sesiones: 12 },
      { ciudad: 'Bogotá', region: 'DC', visitantes: 50, sesiones: 70 },
      { ciudad: 'Desconocida', region: null, visitantes: 7, sesiones: 7 },
    ];
    const { valores, sinRegion } = agregarPorRegion(ciudades, 'CO');
    expect(valores.get('CO-ANT')).toMatchObject({ visitantes: 50, sesiones: 62, pct: 0.5 });
    expect(valores.get('CO-DC')).toMatchObject({ visitantes: 50, pct: 0.5 });
    expect(sinRegion).toBe(7);
    expect(filtrarCiudadesPorRegion(ciudades, 'CO', 'CO-ANT').map((c) => c.ciudad)).toEqual(['Medellín', 'Envigado']);
    expect(filtrarCiudadesPorRegion(ciudades, 'CO', null)).toHaveLength(4);
  });

  test('por región desde `regiones` de la RPC: misma normalización, alias y repetidos sumados', () => {
    const { valores, sinRegion } = agregarRegiones(
      [
        { region: 'ant', visitantes: 40, sesiones: 50 },
        { region: 'CO-ANT', visitantes: 10, sesiones: 12 },
        { region: 'BOG', visitantes: 20, sesiones: 25 },
        { region: ' DC ', visitantes: 30, sesiones: 45 },
        { region: 'no es un código', visitantes: 3, sesiones: 3 },
        { region: 'VAU', visitantes: 0, sesiones: 0 },
      ],
      'CO',
    );
    expect([...valores.keys()].sort()).toEqual(['CO-ANT', 'CO-DC']);
    expect(valores.get('CO-ANT')).toMatchObject({ visitantes: 50, sesiones: 62, pct: 0.5 });
    expect(valores.get('CO-DC')).toMatchObject({ visitantes: 50, sesiones: 70, pct: 0.5 });
    expect(sinRegion).toBe(3);
  });

  test('valoresRegionMapa usa `regiones` cuando viene (sin cota) y cae a las ciudades si no', () => {
    // 51 ciudades en total pero la RPC solo devuelve 2: con ciudades, el mapa
    // perdería el departamento que no está en la lista.
    const ciudades = [
      { ciudad: 'Medellín', region: 'ANT', visitantes: 40, sesiones: 50 },
      { ciudad: 'Bogotá', region: 'DC', visitantes: 50, sesiones: 70 },
    ];
    const regiones = [
      { region: 'DC', visitantes: 50, sesiones: 70 },
      { region: 'ANT', visitantes: 45, sesiones: 56 },
      { region: 'VID', visitantes: 1, sesiones: 1 },
    ];
    const conRegiones = valoresRegionMapa({ ciudades, ciudadesTotal: 51, regiones }, 'CO');
    expect(conRegiones.parcial).toBe(false);
    expect([...conRegiones.valores.keys()].sort()).toEqual(['CO-ANT', 'CO-DC', 'CO-VID']);
    expect(conRegiones.valores.get('CO-ANT')?.visitantes).toBe(45);

    for (const sinClave of [undefined, null]) {
      const respaldo = valoresRegionMapa({ ciudades, ciudadesTotal: 51, regiones: sinClave }, 'CO');
      expect(respaldo.parcial).toBe(true);
      expect([...respaldo.valores.keys()].sort()).toEqual(['CO-ANT', 'CO-DC']);
      expect(respaldo.valores.get('CO-ANT')?.visitantes).toBe(40);
    }
    // Con todas las ciudades en la lista, el respaldo no es cota inferior.
    expect(valoresRegionMapa({ ciudades, ciudadesTotal: 2, regiones: null }, 'CO').parcial).toBe(false);
    // `regiones` vacía (país sin regiones con visitas) no cae a las ciudades.
    expect(valoresRegionMapa({ ciudades, ciudadesTotal: 51, regiones: [] }, 'CO').valores.size).toBe(0);
  });

  test('Colombia por defecto solo si tiene más de la mitad', () => {
    expect(debeAbrirColombia([{ pais: 'CO', visitantes: 51, sesiones: 1 }, { pais: 'US', visitantes: 49, sesiones: 1 }])).toBe(true);
    expect(debeAbrirColombia([{ pais: 'CO', visitantes: 50, sesiones: 1 }, { pais: 'US', visitantes: 50, sesiones: 1 }])).toBe(false);
    expect(debeAbrirColombia([])).toBe(false);
  });
});

describe('ciudades de la tabla (tope de 500 + `ciudades_region`)', () => {
  const ciudades = [
    { ciudad: 'Bogotá', region: 'DC', visitantes: 900, sesiones: 1200 },
    { ciudad: 'Medellín', region: 'ANT', visitantes: 500, sesiones: 700 },
    { ciudad: 'Envigado', region: 'ant', visitantes: 40, sesiones: 44 },
  ];
  const ciudadesRegion = [
    // Fuera del top del país, entre las primeras de su departamento.
    { ciudad: 'Puerto Carreño', region: 'VID', visitantes: 3, sesiones: 3 },
    { ciudad: 'Cumaribo', region: 'VID', visitantes: 1, sesiones: 1 },
    { ciudad: 'Abejorral', region: 'ANT', visitantes: 40, sesiones: 41 },
    // Repetida (no debería pasar, pero no se pinta dos veces).
    { ciudad: 'Envigado', region: 'ant', visitantes: 40, sesiones: 44 },
  ];
  const regiones = [
    { region: 'DC', visitantes: 900, sesiones: 1200, ciudades: 1 },
    { region: 'ANT', visitantes: 580, sesiones: 785, ciudades: 7 },
    { region: 'VID', visitantes: 4, sesiones: 4, ciudades: 2 },
  ];

  test('sin región: el top del país y «N más» hasta ciudades_total', () => {
    const r = ciudadesParaTabla({ ciudades, ciudadesTotal: 620, ciudadesRegion, regiones }, 'CO', null);
    expect(r.ciudades.map((c) => c.ciudad)).toEqual(['Bogotá', 'Medellín', 'Envigado']);
    expect(r.otras).toBe(617);
  });

  test('departamento sin ciudades en el top: salen las de `ciudades_region`', () => {
    const r = ciudadesParaTabla({ ciudades, ciudadesTotal: 620, ciudadesRegion, regiones }, 'CO', 'CO-VID');
    expect(r.ciudades.map((c) => c.ciudad)).toEqual(['Puerto Carreño', 'Cumaribo']);
    expect(r.otras).toBe(0);
  });

  test('departamento con ciudades en el top y fuera: unidas, sin repetir, de más a menos y con «N más»', () => {
    const r = ciudadesParaTabla({ ciudades, ciudadesTotal: 620, ciudadesRegion, regiones }, 'CO', 'CO-ANT');
    expect(r.ciudades.map((c) => c.ciudad)).toEqual(['Medellín', 'Abejorral', 'Envigado']);
    expect(r.otras).toBe(4);
  });

  test('respaldo (base sin la migración): solo filtra `ciudades`, como antes, sin conteo', () => {
    const r = ciudadesParaTabla({ ciudades, ciudadesTotal: 620, ciudadesRegion: null, regiones: null }, 'CO', 'CO-VID');
    expect(r).toEqual({ ciudades: [], otras: 0 });
    const ant = ciudadesParaTabla({ ciudades, ciudadesTotal: 620 }, 'CO', 'CO-ANT');
    expect(ant.ciudades.map((c) => c.ciudad)).toEqual(['Medellín', 'Envigado']);
    expect(ant.otras).toBe(0);
  });

  test('la tabla pagina de a 20', () => {
    expect(CIUDADES_POR_PAGINA).toBe(20);
  });
});

describe('escala de color', () => {
  test('0 sin visitas; 1…5 de menos a más, monótona', () => {
    expect(pasoEscala(0, 100)).toBe(0);
    expect(pasoEscala(5, 0)).toBe(0);
    expect(pasoEscala(1, 1)).toBe(PASOS_ESCALA);
    expect(pasoEscala(100, 100)).toBe(5);
    expect(pasoEscala(1, 10000)).toBe(1);
    let previo = 0;
    for (let v = 1; v <= 3000; v += 7) {
      const p = pasoEscala(v, 3000);
      expect(p).toBeGreaterThanOrEqual(previo);
      expect(p).toBeGreaterThanOrEqual(1);
      previo = p;
    }
  });

  test('rellenos con tokens de la marca (sin colores escritos), gris para sin visitas', () => {
    expect(RELLENOS_ESCALA).toHaveLength(PASOS_ESCALA + 1);
    expect(rellenoPaso(0)).toBe('rgb(var(--border-default))');
    expect(rellenoPaso(3)).toBe('rgb(var(--brand-primary))');
    expect(rellenoPaso(5)).toBe('rgb(var(--brand-deep))');
    expect(rellenoPaso(1)).toContain('--brand-tint');
    expect(rellenoPaso(99)).toBe(rellenoPaso(5));
    for (const r of RELLENOS_ESCALA) expect(r).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('geometrías del repositorio', () => {
  test('mundo: todas las formas con id tienen alfa-2 y no hay Antártida', () => {
    const formas = formasMundo(mundoTopo as unknown as Topology);
    expect(formas.length).toBeGreaterThan(170);
    const sinCodigo = formas.filter((f) => !f.codigo).map((f) => f.nombre).sort();
    expect(sinCodigo).toEqual(['N. Cyprus', 'Somaliland']);
    expect(formas.some((f) => f.codigo === 'AQ')).toBe(false);
    expect(formas.find((f) => f.codigo === 'CO')?.nombre).toBe('Colombia');
    const trazos = dibujarMundo(formas);
    expect(trazos.length).toBe(formas.length);
    expect(trazos.every((t) => t.d.startsWith('M'))).toBe(true);
  });

  test('Colombia: exactamente los 33 códigos ISO 3166-2, San Andrés en recuadro', () => {
    const formas = formasColombia(colombiaTopo as unknown as Topology);
    expect(formas.map((f) => f.codigo).sort()).toEqual(DEPARTAMENTOS_CO.map((d) => d.codigo).sort());
    const { formas: trazos, recuadro } = dibujarColombia(formas);
    expect(trazos).toHaveLength(33);
    expect(recuadro).not.toBeNull();
    const islas = trazos.find((t) => t.codigo === 'CO-SAP');
    expect(islas && recuadro && islas.centro[0] < recuadro.x + recuadro.ancho && islas.centro[1] < recuadro.y + recuadro.alto).toBe(true);
  });
});
