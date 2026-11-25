/**
 * Mis envíos (encargo 2026-11-25): numeración de paradas, siguiente parada tras entregar, estado
 * del cuadre, vigencia de documentos (mismo plazo de 30 días que la base), pines del mapa, enlace
 * de la ruta en Google Maps, cifras del computador y lo que ve quien no es domiciliario.
 */
import {
  DIAS_AVISO_DOCUMENTO,
  accionSiguienteParada,
  agruparMisEnvios,
  coincideParada,
  enlaceRutaGoogleMaps,
  excepcionDeHoy,
  estadoCuadreJornada,
  kpisMisEnvios,
  numeroParada,
  paradasDelFiltro,
  peorVigencia,
  pinesRuta,
  siguienteParada,
  vehiculoDelDia,
  vigenciaDocumento,
  type EnvioDomiciliario,
} from '../misEnvios';
import { atajosSinPerfil, kpisSinPerfil, ATAJOS_DESPACHO } from '../sinPerfil';
import type { FilaDespacho } from '../despacho';

const HOY = '2026-11-25';
const ZONA = 'America/Bogota';
const env = (p: Partial<EnvioDomiciliario> & { id: string }): EnvioDomiciliario => ({ shipment_number: p.id.toUpperCase(), status: 'picked', ...p });

const ruta = [
  env({ id: 'e1', status: 'delivered', delivered_at: '2026-11-25T14:22:00Z', promesa: '2026-11-25T14:30:00Z', delivery_latitude: 4.6, delivery_longitude: -74.1 }),
  env({ id: 'e2', status: 'delivered', delivered_at: '2026-11-25T14:51:00Z', promesa: '2026-11-25T14:40:00Z', cod_amount: 98000, cod_status: 'collected', cod_collected_method: 'cash', cod_collected_amount: 98000 }),
  env({ id: 'e3', status: 'out_for_delivery', cod_amount: 128900, cod_status: 'pending', promesa: '2026-11-25T16:30:00Z', delivery_latitude: 4.65, delivery_longitude: -74.05 }),
  env({ id: 'e4', status: 'picked', promesa: '2026-11-25T17:00:00Z', delivery_address: 'Cra 7 # 45-10', delivery_city: 'Bogotá' }),
  env({ id: 'e5', status: 'assigned', cod_amount: 100000, cod_status: 'pending', promesa: '2026-11-25T19:00:00Z', delivery_latitude: 4.7, delivery_longitude: -74.07 }),
  env({ id: 'e6', status: 'failed_attempt', expected_delivery_date: '2026-11-26', delivery_latitude: 4.55, delivery_longitude: -74.12 }),
];
const g = agruparMisEnvios(ruta, HOY, () => ZONA);

describe('numeración y siguiente parada', () => {
  test('las pendientes se numeran después de las entregadas («parada 3 de 8»)', () => {
    expect(numeroParada(0, 2)).toBe(3);
    expect(numeroParada(2, 2)).toBe(5);
  });

  test('tras entregar, la siguiente es la primera pendiente que no es la entregada', () => {
    expect(siguienteParada(g.pendientes, 'e3')?.id).toBe('e4');
    expect(siguienteParada([], 'e3')).toBeNull();
  });

  test('si el paquete ya va encima, «Iniciar ruta»; si falta recogerlo, abrir la parada', () => {
    expect(accionSiguienteParada({ status: 'picked' })).toBe('iniciar_ruta');
    expect(accionSiguienteParada({ status: 'failed_attempt' })).toBe('iniciar_ruta');
    expect(accionSiguienteParada({ status: 'assigned' })).toBe('abrir');
    expect(accionSiguienteParada(null)).toBe('ver_ruta');
  });
});

describe('cuadre de la jornada', () => {
  test('sin cuadre o anulado: por recibir; abierto: recibiendo; cerrado: cuadrado o con diferencia', () => {
    expect(estadoCuadreJornada(null)).toBe('por_recibir');
    expect(estadoCuadreJornada({ status: 'cancelled', difference: 0 })).toBe('por_recibir');
    expect(estadoCuadreJornada({ status: 'open', difference: 0 })).toBe('recibiendo');
    expect(estadoCuadreJornada({ status: 'closed', difference: '0.00' })).toBe('cuadrado');
    expect(estadoCuadreJornada({ status: 'closed', difference: '-2000' })).toBe('con_diferencia');
  });
});

describe('documentos', () => {
  test('mismo plazo de aviso que la base (30 días): vencido, por vencer y vigente', () => {
    expect(DIAS_AVISO_DOCUMENTO).toBe(30);
    expect(vigenciaDocumento('2026-11-24', HOY)).toEqual({ estado: 'vencido', dias: -1 });
    expect(vigenciaDocumento('2026-12-06', HOY)).toEqual({ estado: 'por_vencer', dias: 11 });
    expect(vigenciaDocumento('2026-12-25', HOY)).toEqual({ estado: 'por_vencer', dias: 30 });
    expect(vigenciaDocumento('2026-12-26', HOY)).toEqual({ estado: 'vigente', dias: 31 });
    expect(vigenciaDocumento(null, HOY)).toEqual({ estado: 'sin_dato', dias: null });
  });

  test('la insignia toma el peor documento', () => {
    expect(peorVigencia([vigenciaDocumento('2027-08-14', HOY), vigenciaDocumento('2026-12-06', HOY)])?.estado).toBe('por_vencer');
    expect(peorVigencia([vigenciaDocumento('2026-12-02', HOY), vigenciaDocumento('2026-11-20', HOY)])).toEqual({ estado: 'vencido', dias: -5 });
    expect(peorVigencia([vigenciaDocumento(null, HOY)])).toBeNull();
  });
});

describe('mapa y Google Maps', () => {
  test('pines en el orden de la ruta: entregados, actual, pendientes y novedades; sin coordenadas no se dibuja', () => {
    const pines = pinesRuta(g);
    expect(pines.map((p) => [p.id, p.numero, p.estado])).toEqual([
      ['e1', 1, 'entregado'],
      ['e3', 3, 'actual'],
      ['e5', 5, 'pendiente'],
      ['e6', 6, 'novedad'],
    ]);
  });

  test('la ruta pendiente en Google Maps: última = destino, las demás paradas intermedias (coordenadas o dirección)', () => {
    const url = enlaceRutaGoogleMaps(g.pendientes);
    expect(url).toContain('destination=4.7%2C-74.07');
    expect(decodeURIComponent(url ?? '')).toContain('waypoints=4.65,-74.05|Cra 7 # 45-10, Bogotá');
    expect(enlaceRutaGoogleMaps([])).toBeNull();
  });

  test('no pasa de 9 paradas intermedias', () => {
    const muchas = Array.from({ length: 14 }, (_, i) => env({ id: `m${i}`, delivery_latitude: 4 + i / 100, delivery_longitude: -74 }));
    const url = decodeURIComponent(enlaceRutaGoogleMaps(muchas) ?? '');
    expect(url.split('waypoints=')[1].split('&')[0].split('|')).toHaveLength(9);
  });
});

describe('computador: cifras, filtro y búsqueda', () => {
  test('cifras del día', () => {
    const k = kpisMisEnvios(g, ruta);
    expect(k.asignados).toBe(5);
    expect(k.parada).toBe(3);
    expect(k.enCamino?.id).toBe('e3');
    expect(k.entregados).toBe(2);
    expect(k.aTiempo).toBe(1);
    expect(k.porCobrar).toBe(228900);
    expect(k.porCobrarEnvios).toBe(2);
    expect(k.enMano).toBe(98000);
  });

  test('«Todos»: entregados por hora, luego pendientes y novedades', () => {
    expect(paradasDelFiltro(g, 'todos').map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
    expect(paradasDelFiltro(g, 'novedades').map((e) => e.id)).toEqual(['e6']);
  });

  test('busca sin tildes por guía, dirección, municipio y barrio', () => {
    const e = { ...env({ id: 'x', delivery_address: 'Cl 72 # 10-34', delivery_city: 'Bogotá' }), barrio: 'Chapinero' };
    expect(coincideParada(e, 'bogota')).toBe(true);
    expect(coincideParada(e, 'CHAPI')).toBe(true);
    expect(coincideParada(e, 'x')).toBe(true);
    expect(coincideParada(e, 'soacha')).toBe(false);
  });
});

describe('sin perfil de domiciliario', () => {
  const secciones = [
    { modulos: [{ paginas: [{ href: '/app/inicio', nombre: 'Inicio' }] }] },
    { modulos: [{ paginas: [{ href: '/app/pos', nombre: 'Punto de venta' }, { href: '/app/clientes', nombre: 'Clientes' }] }] },
    {
      modulos: [
        {
          paginas: [
            { href: '/app/logistica/seguimiento', nombre: 'Seguimiento' },
            { href: '/app/logistica/por-despachar', nombre: 'Por despachar' },
            { href: '/app/logistica/mis-envios', nombre: 'Mis envíos' },
            { href: '/app/logistica/etiquetas', nombre: 'Etiquetas', enMenu: false },
          ],
        },
      ],
    },
  ];

  test('quien despacha: solo los atajos de despacho que su menú le muestra, en el orden del diseño', () => {
    expect(ATAJOS_DESPACHO[0]).toBe('/app/logistica/por-despachar');
    expect(atajosSinPerfil(secciones, true).map((a) => a.href)).toEqual(['/app/logistica/por-despachar', '/app/logistica/seguimiento']);
  });

  test('quien no despacha: las primeras páginas de su menú, nunca Mis envíos ni páginas fuera del menú', () => {
    expect(atajosSinPerfil(secciones, false).map((a) => a.href)).toEqual(['/app/inicio', '/app/pos', '/app/clientes']);
    expect(atajosSinPerfil([], false)).toEqual([]);
  });

  test('cifras de despacho', () => {
    const fila = (p: Partial<FilaDespacho>): FilaDespacho =>
      ({ id: 'f', numero: 'N', status: 'pending', modo: 'own', branchId: 1, canal: 'web', pedido: null, pedidoWebId: null, creado: '2026-11-25T12:00:00Z', cliente: null, telefono: null, direccion: null, ciudad: null, barrio: null, instrucciones: null, promesa: null, fechaEsperada: null, valor: 0, moneda: null, contraentrega: 0, codStatus: null, pagado: false, domiciliarioId: null, domiciliario: null, vehiculoId: null, asignado: null, intentosFallidos: 0, motivoNovedad: null, codigoRequerido: false, ...p }) as FilaDespacho;
    const k = kpisSinPerfil({
      filas: [fila({}), fila({ id: 'b', domiciliarioId: 'd1', status: 'assigned' }), fila({ id: 'c', status: 'failed_attempt', domiciliarioId: 'd1', fechaEsperada: HOY }), fila({ id: 'd', status: 'failed_attempt', domiciliarioId: 'd1', fechaEsperada: '2026-11-27' })],
      envios: [
        { driver_id: 'd1', status: 'out_for_delivery' },
        { driver_id: 'd1', status: 'picked' },
        { driver_id: 'd2', status: 'in_transit' },
        { driver_id: 'd2', status: 'delivered' },
      ],
      porCuadrar: [
        { driver_id: 'd1', cod_collected_amount: 98000 },
        { driver_id: 'd2', cod_collected_amount: '314000' },
      ],
      ahora: new Date('2026-11-25T15:00:00Z'),
      zona: ZONA,
      hoy: HOY,
    });
    expect(k).toEqual({
      porDespachar: 4,
      sinDomiciliario: 1,
      enRuta: 3,
      domiciliariosEnCalle: 2,
      novedades: 2,
      porReprogramarHoy: 1,
      porCuadrar: 412000,
      domiciliariosPorCuadrar: 2,
    });
  });
});

describe('mi vehículo hoy', () => {
  type ConVehiculo = EnvioDomiciliario & { vehicle_id?: string | null; metadata?: Record<string, unknown> | null };
  const con = (p: Partial<ConVehiculo> & { id: string }): ConVehiculo => ({ ...env(p), ...p });

  test('el vehículo congelado en los envíos de la ruta manda; sin él, el por defecto', () => {
    const g1 = agruparMisEnvios([con({ id: 'a', vehicle_id: 'v1' }), con({ id: 'b', vehicle_id: 'v1' }), con({ id: 'c' })], HOY, () => ZONA);
    expect(vehiculoDelDia(g1, 'v9')).toEqual({ vehicleId: 'v1', enviosConPlaca: 2 });
    const g2 = agruparMisEnvios([con({ id: 'a' })], HOY, () => ZONA);
    expect(vehiculoDelDia(g2, 'v9')).toEqual({ vehicleId: 'v9', enviosConPlaca: 0 });
    expect(vehiculoDelDia(g2, null)).toEqual({ vehicleId: null, enviosConPlaca: 0 });
  });

  test('la excepción de HOY sale de los envíos de la ruta (la más reciente, con cuántos envíos)', () => {
    const x = (at: string, motivo: string) => ({ excepcion_asignacion: { causas: [{ causa: 'soat' }, { causa: 'soat' }], motivo, autorizo: 'u1', at } });
    const g3 = agruparMisEnvios(
      [
        con({ id: 'a', metadata: x('2026-11-25T12:52:00Z', 'primero') }),
        con({ id: 'b', metadata: x('2026-11-25T13:10:00Z', 'segundo') }),
        con({ id: 'c', metadata: x('2026-11-24T13:10:00Z', 'ayer') }),
      ],
      HOY,
      () => ZONA,
    );
    expect(excepcionDeHoy(g3, HOY, () => ZONA)).toEqual({ motivo: 'segundo', at: '2026-11-25T13:10:00Z', autorizo: 'u1', causas: ['soat'], envios: 2 });
    expect(excepcionDeHoy(agruparMisEnvios([con({ id: 'z' })], HOY, () => ZONA), HOY, () => ZONA)).toBeNull();
  });
});
