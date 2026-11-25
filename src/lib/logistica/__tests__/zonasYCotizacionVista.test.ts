/**
 * Zonas, cotización y peso (logística Fase 1): lo que muestran el POS, el pedido manual, las
 * zonas y la ficha del producto con la respuesta de `logistica_cotizar_envio`; la decisión del
 * envío del pedido manual en el servidor; los ajustes de Configuración › Logística; y el recorrido
 * de «Probar las reglas con un pedido».
 */
import {
  cargoDeCotizacion,
  cargoEditado,
  decidirEnvioServidor,
  estadoCotizacion,
  leerMedidas,
  municipioPorNombre,
  normalizarMunicipio,
  pesoVolumetrico,
  resolverPeso,
  resumenCobertura,
  tarifaGeneralDe,
  textoMedidas,
  textoPromesa,
  textoTiempoCotizacion,
  zonaCoincideBusqueda,
} from '../presentacionEnvio';
import type { CotizacionEnvio } from '../cotizacion';
import type { UbicacionZona } from '../zonas';
import {
  AJUSTES_LOGISTICA_POR_DEFECTO,
  horasSinMovimiento,
  normalizarAjustesLogistica,
  validarAjustesLogistica,
} from '../ajustesLogistica';
import { camposConCondicion, ordenEvaluacion, recorridoReglas, vaciarCondicion } from '@/components/logistica/zonas/reglasPresentacion';

const base: CotizacionEnvio = {
  en_zona: true,
  zona: { id: 'z2', nombre: 'Zona 2 · Chapinero', es_tarifa_general: false, coincidencia: 'neighborhood' },
  precio: 7000,
  tarifa: 7000,
  moneda: 'COP',
  envio_gratis: false,
  envio_gratis_desde: null,
  falta_para_envio_gratis: null,
  pedido_minimo: 30000,
  cumple_minimo: true,
  falta_para_minimo: 0,
  tiempo: { min_minutos: 45, max_minutos: 60, texto: null },
  despacho: { fecha: '2026-11-23', hoy: true, corte: '19:00:00', dias_reparto: [1, 2, 3, 4, 5, 6], zona_horaria: 'America/Bogota' },
  modo: 'own',
  regla_id: null,
  motivo: null,
  alternativa: null,
  canal: 'pos',
  subtotal: 411597,
};
const general: CotizacionEnvio = {
  ...base,
  en_zona: false,
  zona: { id: 'g', nombre: 'Tarifa general', es_tarifa_general: true, coincidencia: null },
  precio: 15000,
  motivo: 'fuera_de_zona',
  alternativa: 'tarifa_general',
};
const ubic = (u: Partial<UbicacionZona>): UbicacionZona => ({
  id: 'u',
  organization_id: 1,
  zone_id: 'z',
  location_type: 'neighborhood',
  municipality_code: null,
  neighborhood: null,
  neighborhood_key: null,
  postal_code: null,
  polygon: null,
  label: null,
  created_at: '2026-11-23T00:00:00Z',
  ...u,
});

describe('promesa y cobertura de una zona', () => {
  it('texto de la promesa: minutos, rango o texto propio', () => {
    expect(textoPromesa({ promise_min_minutes: 30, promise_max_minutes: 45, promise_text: null })).toBe('30–45 min');
    expect(textoPromesa({ promise_min_minutes: 60, promise_max_minutes: 60, promise_text: null })).toBe('60 min');
    expect(textoPromesa({ promise_min_minutes: null, promise_max_minutes: null, promise_text: 'Mismo día' })).toBe('Mismo día');
    expect(textoPromesa({ promise_min_minutes: null, promise_max_minutes: null, promise_text: null })).toBeNull();
    expect(textoTiempoCotizacion(base)).toBe('45–60 min');
  });

  it('cobertura agrupada por precisión y búsqueda sin tildes', () => {
    const lista = [
      ubic({ location_type: 'municipality', municipality_code: '25754', label: 'Soacha' }),
      ubic({ neighborhood: 'Chapinero Alto' }),
      ubic({ neighborhood: 'Quinta Camacho' }),
    ];
    expect(resumenCobertura(lista)).toEqual([
      { tipo: 'neighborhood', cantidad: 2, muestra: ['Chapinero Alto', 'Quinta Camacho'] },
      { tipo: 'municipality', cantidad: 1, muestra: ['25754 Soacha'] },
    ]);
    expect(zonaCoincideBusqueda({ name: 'Zona 2', description: null, ubicaciones: lista }, 'camacho')).toBe(true);
    expect(zonaCoincideBusqueda({ name: 'Zona 2', description: null, ubicaciones: lista }, 'SOÁCHA')).toBe(true);
    expect(zonaCoincideBusqueda({ name: 'Zona 2', description: null, ubicaciones: lista }, 'medellin')).toBe(false);
  });
});

describe('municipio por nombre (POS y pedido manual)', () => {
  const munis = [
    { code: '11001', name: 'Bogotá, D.C.' },
    { code: '05400', name: 'La Unión' },
    { code: '52399', name: 'La Unión' },
  ];
  it('ignora tildes, mayúsculas y «D.C.»; con homónimos no adivina', () => {
    expect(normalizarMunicipio('Bogotá, D.C.')).toBe('bogota');
    expect(municipioPorNombre('BOGOTA', munis)).toBe('11001');
    expect(municipioPorNombre('La Unión', munis)).toBeNull();
    expect(municipioPorNombre('', munis)).toBeNull();
  });
});

describe('cotización en el POS', () => {
  it('estado y cargo: en zona llena; fuera de zona no llena y ofrece la tarifa general', () => {
    expect(estadoCotizacion(base)).toBe('en_zona');
    expect(cargoDeCotizacion(base)).toBe(7000);
    expect(estadoCotizacion(general)).toBe('fuera_tarifa_general');
    expect(cargoDeCotizacion(general)).toBeNull();
    expect(tarifaGeneralDe(general)).toBe(15000);
    expect(estadoCotizacion({ ...base, cumple_minimo: false, falta_para_minimo: 5000 })).toBe('bajo_minimo');
    expect(estadoCotizacion({ ...general, precio: null, alternativa: 'transportadora' })).toBe('fuera_transportadora');
    expect(estadoCotizacion({ ...general, precio: null, alternativa: null })).toBe('sin_cobertura');
    expect(estadoCotizacion({ ...base, motivo: 'sin_zonas_configuradas', en_zona: false, zona: null, precio: null })).toBe('sin_zonas');
    expect(estadoCotizacion(null)).toBeNull();
  });

  it('un cambio de menos de un peso no cuenta como edición', () => {
    expect(cargoEditado(7000, 7000.4)).toBe(false);
    expect(cargoEditado(7000, 9000)).toBe(true);
    expect(cargoEditado(null, 9000)).toBe(false);
  });
});

describe('envío del pedido manual en el servidor', () => {
  it('sin zonas o sin cotización: el valor escrito, como antes', () => {
    expect(decidirEnvioServidor({ cotizacion: null, enviado: 5000, puedeEditar: false })).toEqual({ ok: true, envio: 5000, fuente: 'cliente', cotizado: null });
    expect(decidirEnvioServidor({ cotizacion: { ...base, motivo: 'sin_zonas_configuradas', en_zona: false, zona: null, precio: null }, enviado: 5000, puedeEditar: false })).toMatchObject({ envio: 5000, fuente: 'sin_zonas' });
  });

  it('con zona: manda la zona; el valor del navegador solo con permiso (y queda como «editado»)', () => {
    expect(decidirEnvioServidor({ cotizacion: base, enviado: 0, puedeEditar: false })).toEqual({ ok: true, envio: 7000, fuente: 'zona', cotizado: 7000 });
    expect(decidirEnvioServidor({ cotizacion: base, enviado: 0, puedeEditar: true })).toEqual({ ok: true, envio: 0, fuente: 'editado', cotizado: 7000 });
    expect(decidirEnvioServidor({ cotizacion: base, enviado: 7000, puedeEditar: true })).toMatchObject({ fuente: 'zona' });
    expect(decidirEnvioServidor({ cotizacion: general, enviado: null, puedeEditar: false })).toMatchObject({ envio: 15000, fuente: 'zona' });
  });

  it('fuera de cobertura o bajo el mínimo: bloqueado salvo con permiso', () => {
    const sinCobertura = { ...general, precio: null, alternativa: null };
    expect(decidirEnvioServidor({ cotizacion: sinCobertura, enviado: 20000, puedeEditar: false })).toEqual({ ok: false, codigo: 'FUERA_DE_COBERTURA' });
    expect(decidirEnvioServidor({ cotizacion: { ...base, cumple_minimo: false }, enviado: 7000, puedeEditar: false })).toEqual({ ok: false, codigo: 'PEDIDO_MINIMO_DOMICILIO' });
    expect(decidirEnvioServidor({ cotizacion: sinCobertura, enviado: 20000, puedeEditar: true })).toMatchObject({ ok: true, envio: 20000, fuente: 'editado' });
  });
});

describe('peso y medidas', () => {
  it('volumétrico = largo × ancho × alto ÷ 5.000', () => {
    expect(pesoVolumetrico({ largo: 35, ancho: 25, alto: 14 })).toBe(2.45);
    expect(pesoVolumetrico({ largo: 35, ancho: null, alto: 14 })).toBeNull();
  });

  it('cadena producto → categoría → organización; se cobra el mayor', () => {
    const r = resolverPeso({ peso: null }, { peso: 1.2, largo: 35, ancho: 25, alto: 14 }, { peso: 0.5 });
    expect(r).toMatchObject({ peso: 1.2, fuente: 'categoria', volumetrico: 2.45, cobrado: 2.45, fuenteMedidas: 'categoria' });
    expect(resolverPeso({ peso: 3 }, { peso: 1.2 }, null)).toMatchObject({ peso: 3, fuente: 'producto', cobrado: 3 });
    expect(resolverPeso(null, null, { peso: '0.5' })).toMatchObject({ peso: 0.5, fuente: 'organizacion' });
    expect(resolverPeso(null, null, null)).toMatchObject({ peso: null, fuente: null, cobrado: null });
  });

  it('medidas escritas «35 × 25 × 14»', () => {
    expect(leerMedidas('35 × 25 × 14')).toEqual({ largo: 35, ancho: 25, alto: 14 });
    expect(leerMedidas('35x25x14,5')).toEqual({ largo: 35, ancho: 25, alto: 14.5 });
    expect(leerMedidas('')).toEqual({ largo: null, ancho: null, alto: null });
    expect(leerMedidas('35 x 25')).toBeNull();
    expect(textoMedidas({ largo: 35, ancho: 25, alto: 14 })).toBe('35 × 25 × 14');
    expect(textoMedidas({ largo: 35, ancho: null, alto: 14 })).toBe('');
  });
});

describe('ajustes de Configuración › Logística', () => {
  it('por defecto: 2 h propio, 24 h transportadora, envío gratis en la web', () => {
    expect(normalizarAjustesLogistica(null)).toEqual(AJUSTES_LOGISTICA_POR_DEFECTO);
    expect(AJUSTES_LOGISTICA_POR_DEFECTO).toEqual({ horasSinMovimientoPropio: 2, horasSinMovimientoTransportadora: 24, envioGratisPorDefecto: 'web', codigoEntregaContraentrega: true, bloqueoDocumentosAsignacion: false });
    expect(horasSinMovimiento(AJUSTES_LOGISTICA_POR_DEFECTO, true)).toBe(24);
    expect(horasSinMovimiento(AJUSTES_LOGISTICA_POR_DEFECTO, false)).toBe(2);
  });

  it('lo guardado inválido toma el valor por defecto; la ruta valida estricto', () => {
    expect(normalizarAjustesLogistica({ horasSinMovimientoPropio: 0, envioGratisPorDefecto: 'todo' })).toEqual(AJUSTES_LOGISTICA_POR_DEFECTO);
    expect(validarAjustesLogistica({ horasSinMovimientoPropio: 3, horasSinMovimientoTransportadora: 48, envioGratisPorDefecto: 'both' })).toEqual({
      ok: true,
      ajustes: { horasSinMovimientoPropio: 3, horasSinMovimientoTransportadora: 48, envioGratisPorDefecto: 'both', codigoEntregaContraentrega: true, bloqueoDocumentosAsignacion: false },
    });
    expect(validarAjustesLogistica({ horasSinMovimientoPropio: 3.5, horasSinMovimientoTransportadora: 48, envioGratisPorDefecto: 'both' })).toEqual({ ok: false, error: 'horas_invalidas' });
    expect(validarAjustesLogistica({ horasSinMovimientoPropio: 3, horasSinMovimientoTransportadora: 500, envioGratisPorDefecto: 'web' })).toEqual({ ok: false, error: 'horas_invalidas' });
    expect(validarAjustesLogistica({ horasSinMovimientoPropio: 3, horasSinMovimientoTransportadora: 48, envioGratisPorDefecto: 'x' })).toEqual({ ok: false, error: 'envio_gratis_invalido' });
  });

  it('el código de entrega en contraentrega: encendido salvo un false explícito (igual que la base)', () => {
    expect(normalizarAjustesLogistica({ codigoEntregaContraentrega: 'no' }).codigoEntregaContraentrega).toBe(true);
    expect(normalizarAjustesLogistica({ codigoEntregaContraentrega: false }).codigoEntregaContraentrega).toBe(false);
    const base = { horasSinMovimientoPropio: 3, horasSinMovimientoTransportadora: 48, envioGratisPorDefecto: 'web' };
    expect(validarAjustesLogistica({ ...base, codigoEntregaContraentrega: false })).toEqual({ ok: true, ajustes: { ...base, codigoEntregaContraentrega: false, bloqueoDocumentosAsignacion: false } });
    expect(validarAjustesLogistica({ ...base, codigoEntregaContraentrega: 'false' })).toEqual({ ok: false, error: 'codigo_entrega_invalido' });
  });
});

describe('reglas de despacho', () => {
  const regla = (id: string, priority: number, extra: Record<string, unknown> = {}) => ({
    id,
    priority,
    branch_id: null as number | null,
    is_active: true,
    created_at: `2026-11-23T00:00:0${priority % 10}Z`,
    ...extra,
  });

  it('condiciones presentes y su limpieza', () => {
    expect(camposConCondicion({ channels: ['pos'], zone_ids: [], min_order_value: 1000, time_to: '20:00' })).toEqual(['canal', 'valor', 'horario']);
    expect(vaciarCondicion('peso')).toEqual({ min_weight_kg: null, max_weight_kg: null });
  });

  it('orden de la base: primero las de la sede, luego prioridad', () => {
    const lista = [regla('a', 1), regla('b', 5, { branch_id: 3 }), regla('c', 2)];
    expect(ordenEvaluacion(lista).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('recorrido: las anteriores no aplicaron, la elegida decide, las siguientes no se evaluaron', () => {
    const lista = [regla('a', 1), regla('b', 2), regla('c', 3), regla('d', 4, { is_active: false }), regla('e', 5, { branch_id: 9 })];
    expect(recorridoReglas(lista, 'b', 3).map((p) => [p.regla.id, p.paso])).toEqual([
      ['e', 'otra_sede'],
      ['a', 'no_aplica'],
      ['b', 'decide'],
      ['c', 'sin_evaluar'],
      ['d', 'en_pausa'],
    ]);
    expect(recorridoReglas(lista, null, 3).filter((p) => p.paso === 'decide')).toHaveLength(0);
  });
});
