/**
 * Configuración › Transporte (Figma «23 Transporte» › 21b): normalización y validación de los
 * ajustes que guarda `PUT /api/transporte/ajustes`.
 */
import {
  AJUSTES_TRANSPORTE_POR_DEFECTO,
  MOTIVOS_POR_DEFECTO,
  TIPOS_VEHICULO,
  idMotivoNuevo,
  motivosActivos,
  normalizarAjustesTransporte,
  usaEmbarcaciones,
  validarAjustesTransporte,
} from '../ajustesTransporte';

describe('ajustes de Transporte', () => {
  it('por defecto: los valores del diseño (5 · 15 · 5 min, 30 min, 2 h, 90 %, 10 %) y todo excepcionable con PIN', () => {
    const a = normalizarAjustesTransporte(null);
    expect(a).toEqual(AJUSTES_TRANSPORTE_POR_DEFECTO);
    expect(a.retencion).toEqual({ taquilla: 5, web: 15, pos: 5 });
    expect([a.cambioSinCostoMin, a.anulacionHoras, a.reembolsoPct, a.administracionAfiliadosPct]).toEqual([30, 2, 90, 10]);
    expect(a.excepciones).toEqual({ documentosVehiculo: true, documentosConductor: true, manifiesto: true, pedirPin: true });
    expect(a.motivosNovedad.map((m) => m.id)).toEqual(MOTIVOS_POR_DEFECTO.map((m) => m.id));
    expect(a.tiposVehiculo.map((t) => t.codigo).sort()).toEqual([...TIPOS_VEHICULO].sort());
    expect(usaEmbarcaciones(a)).toBe(true);
  });

  it('los 8 motivos del diseño guardan un incident_type que la base acepta', () => {
    const permitidos = ['delay', 'accident', 'damage', 'lost', 'theft', 'customer_complaint', 'vehicle_breakdown', 'route_blocked', 'driver_issue', 'weather', 'documentation', 'other'];
    for (const m of MOTIVOS_POR_DEFECTO) expect(permitidos).toContain(m.tipo);
    expect(MOTIVOS_POR_DEFECTO.filter((m) => m.bloqueaVehiculo).map((m) => m.id)).toEqual(['falla_mecanica', 'accidente']);
  });

  it('lo guardado inválido toma el valor por defecto; solo un false explícito apaga (igual que la base)', () => {
    const a = normalizarAjustesTransporte({ retencion: { taquilla: 0, web: 999, pos: '5' }, excepciones: { pedirPin: 'no', manifiesto: false }, reembolsoPct: 150 });
    expect(a.retencion).toEqual(AJUSTES_TRANSPORTE_POR_DEFECTO.retencion);
    expect(a.reembolsoPct).toBe(90);
    expect(a.excepciones.pedirPin).toBe(true);
    expect(a.excepciones.manifiesto).toBe(false);
  });

  it('tipos: conserva el orden guardado, quita duplicados y agrega apagados los que faltan', () => {
    const a = normalizarAjustesTransporte({ tiposVehiculo: [{ codigo: 'yacht', activo: true }, { codigo: 'yacht', activo: false }, { codigo: 'avion', activo: true }] });
    expect(a.tiposVehiculo[0]).toEqual({ codigo: 'yacht', activo: true });
    expect(a.tiposVehiculo).toHaveLength(TIPOS_VEHICULO.length);
    expect(a.tiposVehiculo.filter((t) => t.activo)).toEqual([{ codigo: 'yacht', activo: true }]);
    expect(usaEmbarcaciones({ tiposVehiculo: [{ codigo: 'bus', activo: true }, { codigo: 'boat', activo: false }] })).toBe(false);
  });

  it('la ruta valida estricto', () => {
    const base = JSON.parse(JSON.stringify(AJUSTES_TRANSPORTE_POR_DEFECTO));
    expect(validarAjustesTransporte(base)).toEqual({ ok: true, ajustes: AJUSTES_TRANSPORTE_POR_DEFECTO });
    expect(validarAjustesTransporte({ ...base, retencion: { ...base.retencion, web: 0 } })).toEqual({ ok: false, error: 'retencion_invalida' });
    expect(validarAjustesTransporte({ ...base, anulacionHoras: 2.5 })).toEqual({ ok: false, error: 'plazos_invalidos' });
    expect(validarAjustesTransporte({ ...base, reembolsoPct: 101 })).toEqual({ ok: false, error: 'porcentaje_invalido' });
    expect(validarAjustesTransporte({ ...base, excepciones: { ...base.excepciones, pedirPin: 'true' } })).toEqual({ ok: false, error: 'booleano_invalido' });
    expect(validarAjustesTransporte({ ...base, tiposVehiculo: [{ codigo: 'bus', activo: true }, { codigo: 'bus', activo: true }] })).toEqual({ ok: false, error: 'tipos_invalidos' });
    // Motivo nuevo sin nombre, ids repetidos o ninguno activo: no.
    expect(validarAjustesTransporte({ ...base, motivosNovedad: [...base.motivosNovedad, { id: 'pinchazo', nombre: ' ', tipo: 'other', gravedad: 'leve', bloqueaVehiculo: false, activo: true }] })).toEqual({ ok: false, error: 'motivos_invalidos' });
    expect(validarAjustesTransporte({ ...base, motivosNovedad: [base.motivosNovedad[0], base.motivosNovedad[0]] })).toEqual({ ok: false, error: 'motivos_invalidos' });
    expect(validarAjustesTransporte({ ...base, motivosNovedad: base.motivosNovedad.map((m: object) => ({ ...m, activo: false })) })).toEqual({ ok: false, error: 'motivos_invalidos' });
    const conNuevo = { ...base, motivosNovedad: [...base.motivosNovedad, { id: 'pinchazo', nombre: 'Pinchazo', tipo: 'other', gravedad: 'leve', bloqueaVehiculo: false, activo: true }] };
    const r = validarAjustesTransporte(conNuevo);
    expect(r.ok && motivosActivos(r.ajustes).map((m) => m.id).at(-1)).toBe('pinchazo');
  });

  it('id de un motivo nuevo: sin tildes y único', () => {
    expect(idMotivoNuevo('Pinchazo de llanta', [])).toBe('pinchazo_de_llanta');
    expect(idMotivoNuevo('Retraso', ['retraso'])).toBe('retraso_2');
    expect(idMotivoNuevo('¡¿?!', [])).toBe('motivo');
    expect(idMotivoNuevo('Árbol caído', [])).toBe('arbol_caido');
  });
});
