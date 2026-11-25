/**
 * Logística 1b — el domiciliario y el vehículo. Criterio 12 de la especificación v2:
 * preselección, bloqueo por documento vencido, excepción con PIN (motivo, servidor, 5 intentos en
 * 15 minutos), categoría de licencia, aviso de capacidad sin bloqueo, uso según el módulo de alta,
 * no borrar el vehículo por defecto al liberar y espejo de placa o «sin vehículo» en el envío.
 *
 * Las reglas viven en la base (migración 20261125044314, prueba en seco en la organización 149):
 * aquí se prueba lo que la pantalla lee de ella y, con el SQL de la migración como contrato, que
 * las reglas del servidor siguen escritas como se aprobaron.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  avisoCapacidad,
  avisosVisibles,
  excepcionCompleta,
  excepcionDelEnvio,
  faltaVehiculo,
  leerResultadoAsignacion,
  leerRevision,
  motivoNoAsignar,
  placaObligatoria,
  requiereVehiculo,
  seleccionAParametros,
  seleccionAValor,
  seleccionInicial,
  sirveEn,
  usoConAmbos,
  usoInicial,
  valorASeleccion,
  vehiculoDelEnvio,
  vehiculoDePersona,
} from '../vehiculoAsignacion';
import { altaDomiciliarioSchema, filaAlta } from '../domiciliarios';
import { CATEGORIAS_POR_TIPO, formularioAVehiculo, personaAFormulario, validarVehiculo, vehiculoAFormulario } from '@/lib/transporte/formulariosCatalogo';
import { normalizarAjustesLogistica } from '../ajustesLogistica';

const MIGRACION = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261125044314_logistica_1b_domiciliario_vehiculo.sql'), 'utf8');
const ROLLBACK = path.join(process.cwd(), 'supabase/rollbacks/20261125044314_logistica_1b_domiciliario_vehiculo_rollback.sql');

/** Cuerpo de una función de la migración (entre su `create or replace` y el `$$;` que la cierra). */
function cuerpo(nombre: string): string {
  const i = MIGRACION.indexOf(`create or replace function public.${nombre}(`);
  if (i < 0) throw new Error(`no está ${nombre}`);
  const fin = MIGRACION.indexOf('\n$$;', i);
  const fin2 = MIGRACION.indexOf('\n$function$;', i);
  const cierre = [fin, fin2].filter((x) => x > 0).sort((a, b) => a - b)[0];
  return MIGRACION.slice(i, cierre);
}

const revisionBase = {
  fecha: '2026-11-24',
  tipo_persona: 'motorcycle',
  requiere_vehiculo: true,
  vehiculo: { id: 'v-1', placa: 'ABC 12F', tipo: 'motorcycle', dueno: 'company', owner_driver_id: null, capacity_kg: 150, capacity_m3: null },
  peso: 20,
  volumen: null,
  bloqueos: [],
  avisos: [],
  bloqueo_activo: false,
  hay_autorizador_con_pin: false,
  bloquea: false,
  admite_excepcion: false,
  origen: 'defecto',
  vehiculo_ocupado: false,
};

describe('preselección (regla 4.5): envío > por defecto > «a pie / bici» explícito', () => {
  it('arranca en el vehículo que sugirió la base (el por defecto)', () => {
    const r = leerRevision(revisionBase);
    expect(r.origen).toBe('defecto');
    expect(seleccionInicial(r)).toEqual({ tipo: 'vehiculo', id: 'v-1' });
  });

  it('sin vehículo por defecto y tipo bici o a pie: «sin vehículo» explícito, nunca «el del domiciliario»', () => {
    const bici = leerRevision({ ...revisionBase, tipo_persona: 'bicycle', requiere_vehiculo: false, vehiculo: null, sin_vehiculo: 'bicycle', origen: 'tipo' });
    expect(seleccionInicial(bici)).toEqual({ tipo: 'sin', motivo: 'bicycle' });
    const aPie = leerRevision({ ...revisionBase, tipo_persona: 'on_foot', requiere_vehiculo: false, vehiculo: null, sin_vehiculo: 'on_foot', origen: 'tipo' });
    expect(seleccionInicial(aPie)).toEqual({ tipo: 'sin', motivo: 'on_foot' });
  });

  it('el selector y la RPC hablan el mismo idioma (vehículo o motivo, nunca los dos)', () => {
    expect(valorASeleccion(seleccionAValor({ tipo: 'vehiculo', id: 'v-9' }))).toEqual({ tipo: 'vehiculo', id: 'v-9' });
    expect(valorASeleccion('sin:on_foot')).toEqual({ tipo: 'sin', motivo: 'on_foot' });
    expect(valorASeleccion('ninguno')).toEqual({ tipo: 'ninguno' });
    expect(seleccionAParametros({ tipo: 'vehiculo', id: 'v-9' })).toEqual({ vehiculoId: 'v-9', sinVehiculo: null });
    expect(seleccionAParametros({ tipo: 'sin', motivo: 'bicycle' })).toEqual({ vehiculoId: null, sinVehiculo: 'bicycle' });
  });

  it('la base aplica el mismo orden: envío con la misma persona, por defecto usable, tipo', () => {
    const f = cuerpo('fn_logistica_vehiculo_sugerido');
    const iEnvio = f.indexOf("'envio'::text");
    const iDefecto = f.indexOf("'defecto'::text");
    const iTipo = f.indexOf("'tipo'::text");
    expect(iEnvio).toBeGreaterThan(0);
    expect(iDefecto).toBeGreaterThan(iEnvio);
    expect(iTipo).toBeGreaterThan(iDefecto);
    // Sin vehículo ni motivo, la RPC usa la sugerencia (el POS y el alta manual mandan null).
    expect(cuerpo('logistica_asignar_domiciliario')).toMatch(/fn_logistica_vehiculo_sugerido\(v_s\.organization_id, p_driver_id, v_s\.vehicle_id, v_s\.driver_id/);
  });
});

describe('obligatoriedad y bloqueo por documentos', () => {
  it('moto, carro y camioneta piden vehículo; bici, a pie y «otro» no', () => {
    expect(['motorcycle', 'car', 'van'].map(requiereVehiculo)).toEqual([true, true, true]);
    expect(['bicycle', 'on_foot', 'other', null].map(requiereVehiculo)).toEqual([false, false, false, false]);
  });

  it('con el bloqueo efectivo, un SOAT vencido bloquea y pide la excepción', () => {
    const r = leerRevision({
      ...revisionBase,
      bloqueos: [{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: true }],
      bloqueo_activo: true,
      hay_autorizador_con_pin: true,
      bloquea: true,
      admite_excepcion: true,
    });
    expect(motivoNoAsignar(r, { tipo: 'vehiculo', id: 'v-1' })).toBe('bloqueado');
    expect(avisosVisibles(r)).toEqual([]);
  });

  it('decisión 6: apagado (o nadie con PIN) solo avisa y no frena la asignación', () => {
    const r = leerRevision({ ...revisionBase, bloqueos: [{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: true }], bloqueo_activo: true, hay_autorizador_con_pin: false, bloquea: false, admite_excepcion: true });
    expect(motivoNoAsignar(r, { tipo: 'vehiculo', id: 'v-1' })).toBeNull();
    expect(avisosVisibles(r).map((a) => a.causa)).toEqual(['soat']);
    const c = cuerpo('fn_logistica_cumplimiento_asignacion');
    expect(c).toMatch(/'bloquea', v_activo and v_con_pin and jsonb_array_length\(v_bloqueos\) > 0/);
    expect(cuerpo('fn_logistica_bloqueo_documentos')).toMatch(/= 'true'/);
    expect(normalizarAjustesLogistica({}).bloqueoDocumentosAsignacion).toBe(false);
  });

  it('moto sin vehículo con el bloqueo activo: no admite excepción (se elige un vehículo)', () => {
    const r = leerRevision({ ...revisionBase, vehiculo: null, bloqueos: [{ causa: 'vehiculo_requerido', grupo: 'asignacion', excepcion: false }], bloqueo_activo: true, hay_autorizador_con_pin: true, bloquea: true, admite_excepcion: false });
    expect(motivoNoAsignar(r, { tipo: 'ninguno' })).toBe('vehiculo_requerido');
  });

  it('bici, «otro» y vehículo de un tercero no se revisan (decisión 3 y regla 5.3)', () => {
    const c = cuerpo('fn_logistica_cumplimiento_asignacion');
    expect(c).toMatch(/if v_categorias is not null and v\.ownership <> 'third_party' then/);
    expect(cuerpo('fn_flota_categorias_licencia')).not.toMatch(/'bicycle'|'other'/);
  });

  it('una placa con envíos abiertos de otra persona no se asigna (criterio 6)', () => {
    expect(cuerpo('logistica_asignar_domiciliario')).toMatch(/raise exception 'VEHICULO_OCUPADO'/);
    expect(motivoNoAsignar(leerRevision({ ...revisionBase, vehiculo_ocupado: true }), { tipo: 'vehiculo', id: 'v-1' })).toBe('ocupado');
  });
});

describe('categoría de licencia', () => {
  it('la tabla de la base es la misma que CATEGORIAS_POR_TIPO del formulario', () => {
    const f = cuerpo('fn_flota_categorias_licencia');
    for (const [tipo, cats] of Object.entries(CATEGORIAS_POR_TIPO)) {
      const linea = f.match(new RegExp(`when '${tipo}' then array\\[([^\\]]*)\\]`));
      if (cats === null) expect(linea).toBeNull();
      else expect(linea?.[1].split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual([...cats]);
    }
  });

  it('licencia de otra categoría o sin licencia bloquean (con excepción)', () => {
    const c = cuerpo('fn_logistica_cumplimiento_asignacion');
    expect(c).toMatch(/'categoria_licencia'/);
    expect(c).toMatch(/'sin_licencia'/);
    const r = leerRevision({ ...revisionBase, bloqueos: [{ causa: 'categoria_licencia', grupo: 'conductor', categoria: 'B1', requeridas: ['A1', 'A2'], excepcion: true }] });
    expect(r.bloqueos[0]).toMatchObject({ causa: 'categoria_licencia', categoria: 'B1', requeridas: ['A1', 'A2'], excepcion: true });
  });
});

describe('excepción con PIN del supervisor', () => {
  it('pide motivo (10–500), supervisor con PIN y PIN de 6 dígitos', () => {
    const sup = { tienePin: true };
    expect(excepcionCompleta('corto', '123456', true, sup)).toBe(false);
    expect(excepcionCompleta('Entrega urgente: renovó el SOAT hoy', '12345', true, sup)).toBe(false);
    expect(excepcionCompleta('Entrega urgente: renovó el SOAT hoy', '123456', true, { tienePin: false })).toBe(false);
    expect(excepcionCompleta('Entrega urgente: renovó el SOAT hoy', '123456', true, sup)).toBe(true);
  });

  it('el PIN se valida en el servidor contra hr_credentials, nunca en el navegador', () => {
    const a = cuerpo('logistica_asignar_domiciliario');
    expect(a).toMatch(/fn_hr_credencial_lookup\(public\.fn_hr_marcacion_pepper\(v_s\.organization_id\), 'pin', p_pin\)/);
    expect(a).toMatch(/v_cred\.secret_hash = extensions\.crypt\(p_pin, v_cred\.secret_hash\)/);
    expect(a).toMatch(/'logistica\.asignacion\.excepcion'/);
    expect(a).toMatch(/length\(btrim\(p_motivo\)\) < 10 or length\(p_motivo\) > 500/);
  });

  it('decisión 2: 5 fallos en 15 minutos sobre el PIN del SUPERVISOR, y se registra quién pidió', () => {
    const a = cuerpo('logistica_asignar_domiciliario');
    expect(a).toMatch(/l\.supervisor = p_supervisor and l\.event = 'pin_rechazado'\s+and l\.created_at > v_ahora - interval '15 minutes'/);
    expect(a).toMatch(/if v_fallos >= 5 then/);
    expect(a).toMatch(/'pin_rechazado', v_bloqueos, v_actor, p_supervisor\)/);
    // La bitácora no la escribe nadie más que la RPC.
    expect(MIGRACION).toMatch(/revoke insert, update, delete on public\.shipment_assignment_log from anon, authenticated/);
  });

  it('lee los rechazos de la base (intentos restantes y hasta cuándo)', () => {
    expect(leerResultadoAsignacion({ ok: false, estado: 'pin_rechazado', intentos_restantes: 3 })).toMatchObject({ ok: false, estado: 'pin_rechazado', intentosRestantes: 3 });
    expect(leerResultadoAsignacion({ ok: false, estado: 'pin_bloqueado', hasta: '2026-11-25T04:55:11Z' })).toMatchObject({ estado: 'pin_bloqueado', hasta: '2026-11-25T04:55:11Z' });
    expect(leerResultadoAsignacion({ ok: true, estado: 'asignado_con_excepcion' }).ok).toBe(true);
    // Respuesta de la versión anterior (sin estado): cuenta como asignado.
    expect(leerResultadoAsignacion({ ok: true, shipment_id: 'x' }).estado).toBe('asignado');
  });

  it('la excepción queda en el envío con motivo, quién pidió y quién autorizó', () => {
    const e = excepcionDelEnvio({ excepcion_asignacion: { causas: [{ causa: 'soat' }], motivo: 'Entrega urgente', pidio: 'u1', autorizo: 'u2', at: '2026-11-25T04:40:00Z' } });
    expect(e).toEqual({ causas: ['soat'], motivo: 'Entrega urgente', pidio: 'u1', autorizo: 'u2', at: '2026-11-25T04:40:00Z' });
    expect(excepcionDelEnvio({})).toBeNull();
  });
});

describe('capacidad: solo avisa (decisión 4)', () => {
  it('el aviso de capacidad no bloquea', () => {
    const r = leerRevision({ ...revisionBase, peso: 168, avisos: [{ causa: 'capacidad_kg', grupo: 'capacidad', valor: 168, capacidad: 150 }] });
    expect(avisoCapacidad(r)).toMatchObject({ causa: 'capacidad_kg', valor: 168, capacidad: 150 });
    expect(motivoNoAsignar(r, { tipo: 'vehiculo', id: 'v-1' })).toBeNull();
    const c = cuerpo('fn_logistica_cumplimiento_asignacion');
    expect(c).toMatch(/v_avisos := v_avisos \|\| jsonb_build_object\('causa', 'capacidad_kg'/);
    expect(c).not.toMatch(/v_bloqueos := v_bloqueos \|\| jsonb_build_object\('causa', 'capacidad/);
  });
});

describe('uso según el módulo de alta (decisión 9.6)', () => {
  it('nace en el módulo, nunca en «Ambos»; la casilla lo pasa a «Ambos»', () => {
    expect(usoInicial('logistica')).toBe('logistics');
    expect(usoInicial('transporte')).toBe('transport');
    expect(usoConAmbos('logistica', false)).toBe('logistics');
    expect(usoConAmbos('logistica', true)).toBe('both');
    expect(vehiculoAFormulario(null, { sede: null, uso: 'logistics' }).usage).toBe('logistics');
    expect(vehiculoAFormulario(null, { sede: null, uso: 'transport' }).usage).toBe('transport');
    expect(personaAFormulario(null, { sede: null, uso: 'logistics' }).usage).toBe('logistics');
  });

  it('el alta de Domiciliarios guarda uso Logística por defecto', () => {
    const alta = altaDomiciliarioSchema.parse({ nombre: 'Luisa Martínez', celular: '3005550142', tipoDocumento: 'CC', documento: '1024556871', branchId: 1 });
    expect(filaAlta(alta, 7).usage).toBe('logistics');
    expect(filaAlta({ ...alta, uso: 'both' }, 7).usage).toBe('both');
  });

  it('un bus de Transporte no sale en domicilios y una moto de Logística no sale en viajes', () => {
    expect(sirveEn('transport', 'logistica')).toBe(false);
    expect(sirveEn('logistics', 'transporte')).toBe(false);
    expect(sirveEn('both', 'logistica')).toBe(true);
    expect(cuerpo('logistica_asignar_domiciliario')).toMatch(/usage in \('logistics', 'both'\)/);
  });
});

describe('liberar el vehículo no borra el por defecto (5.5, criterio 7)', () => {
  it('fn_logistica_liberar_vehiculo solo devuelve el estado a «Disponible»', () => {
    const f = cuerpo('fn_logistica_liberar_vehiculo');
    expect(f).toMatch(/set status = 'available', updated_at = now\(\)/);
    expect(f).not.toMatch(/current_driver_id\s*=/);
    expect(f).not.toMatch(/default_vehicle_id/);
  });

  it('asignar ya no reescribe current_driver_id (es el espejo del por defecto)', () => {
    expect(cuerpo('logistica_asignar_domiciliario')).not.toMatch(/current_driver_id\s*=/);
  });
});

describe('espejo de placa o «sin vehículo» en el envío (4.4, criterio 4)', () => {
  it('manda el espejo guardado aunque la ficha del vehículo cambie después', () => {
    const v = vehiculoDelEnvio({ vehiculo: { id: 'v-1', placa: 'ABC 12F', tipo: 'motorcycle', dueno: 'company' } }, { id: 'v-1', plate: 'ABC 99Z', vehicle_type: 'motorcycle' });
    expect(v).toEqual({ tipo: 'vehiculo', id: 'v-1', placa: 'ABC 12F', tipoVehiculo: 'motorcycle', dueno: 'company' });
  });

  it('a pie y bici sin vehículo quedan explícitos (vehicle_id null)', () => {
    expect(vehiculoDelEnvio({ sin_vehiculo: 'on_foot' })).toEqual({ tipo: 'sin', motivo: 'on_foot' });
    expect(vehiculoDelEnvio({ sin_vehiculo: 'bicycle' })).toEqual({ tipo: 'sin', motivo: 'bicycle' });
    expect(vehiculoDelEnvio({})).toBeNull();
    const a = cuerpo('logistica_asignar_domiciliario');
    expect(a).toMatch(/'sin_vehiculo', case when v_vehicle is null then v_sin end/);
    expect(a).toMatch(/'vehiculo', v_espejo/);
  });

  it('envíos de antes de la 1b (sin espejo) muestran el vehículo actual', () => {
    expect(vehiculoDelEnvio({ vehicle_id: 'v-2' }, { id: 'v-2', plate: 'XYZ 34H', vehicle_type: 'motorcycle', ownership: 'driver' })).toMatchObject({ tipo: 'vehiculo', placa: 'XYZ 34H', dueno: 'driver' });
  });
});

describe('flota: bici sin placa, dueño y vehículo por defecto', () => {
  it('placa opcional solo en bici o vehículo de un tercero', () => {
    expect(placaObligatoria('motorcycle', 'company')).toBe(true);
    expect(placaObligatoria('motorcycle', 'driver')).toBe(true);
    expect(placaObligatoria('bicycle', 'company')).toBe(false);
    expect(placaObligatoria('car', 'third_party')).toBe(false);
    const bici = { ...vehiculoAFormulario(null, { sede: null, uso: 'logistics' }), vehicle_type: 'bicycle', plate: '' };
    expect(validarVehiculo(bici, new Set(), 2027).plate).toBeUndefined();
    expect(formularioAVehiculo(bici).plate).toBeNull();
    const moto = { ...bici, vehicle_type: 'motorcycle' };
    expect(validarVehiculo(moto, new Set(), 2027).plate).toBe('requerido');
    expect(MIGRACION).toMatch(/vehicles_placa_check[\s\S]*vehicle_type = 'bicycle' or ownership = 'third_party'/);
  });

  it('del domiciliario exige quién es el dueño', () => {
    const f = { ...vehiculoAFormulario(null, { sede: null, uso: 'logistics' }), plate: 'KLM 48E', vehicle_type: 'motorcycle', ownership: 'driver' as const };
    expect(validarVehiculo(f, new Set(), 2027).owner_driver_id).toBe('requerido');
    expect(formularioAVehiculo({ ...f, owner_driver_id: 'd-1' })).toMatchObject({ ownership: 'driver', owner_driver_id: 'd-1', usage: 'logistics' });
  });

  it('decisión 5: un vehículo no es el por defecto de dos personas', () => {
    expect(MIGRACION).toMatch(/create unique index if not exists uq_driver_credentials_default_vehicle\s+on public\.driver_credentials \(default_vehicle_id\) where default_vehicle_id is not null/);
  });

  it('el vehículo nuevo del alta exige placa salvo bici o tercero', () => {
    const base = { nombre: 'Luisa Martínez', celular: '3005550142', tipoDocumento: 'CC' as const, documento: '1024556871', branchId: 1, tipoVehiculo: 'motorcycle' as const };
    expect(altaDomiciliarioSchema.safeParse({ ...base, vehiculoNuevo: { placa: '', tipo: 'motorcycle', dueno: 'driver' } }).success).toBe(false);
    expect(altaDomiciliarioSchema.safeParse({ ...base, vehiculoNuevo: { placa: 'KLM 48E', tipo: 'motorcycle', dueno: 'driver', soat: '2027-08-30' } }).success).toBe(true);
    expect(altaDomiciliarioSchema.safeParse({ ...base, vehiculoNuevo: { placa: '', tipo: 'bicycle', dueno: 'company' } }).success).toBe(true);
    expect(altaDomiciliarioSchema.safeParse({ ...base, vehiculoId: '0f3c1c62-1111-4a3e-9c1b-2f0a9b8c7d6e', vehiculoNuevo: { placa: 'KLM 48E', tipo: 'motorcycle', dueno: 'company' } }).success).toBe(false);
  });

  it('KPI «sin vehículo»: a pie y bici sin registrar no son falta', () => {
    expect(faltaVehiculo({ tipoVehiculo: 'on_foot', vehiculoId: null })).toBe(false);
    expect(faltaVehiculo({ tipoVehiculo: 'bicycle', vehiculoId: null })).toBe(false);
    expect(faltaVehiculo({ tipoVehiculo: 'motorcycle', vehiculoId: null })).toBe(true);
    expect(faltaVehiculo({ tipoVehiculo: 'motorcycle', vehiculoId: 'v-1' })).toBe(false);
  });

  it('la columna «Vehículo» de un domiciliario dice la placa, «a pie» o «bici sin registrar»', () => {
    expect(vehiculoDePersona({ vehicle_type: 'motorcycle', vehiculo: { plate: 'ABC 12F', vehicle_type: 'motorcycle' } })).toEqual({ estado: 'con', tipo: 'motorcycle', placa: 'ABC 12F' });
    expect(vehiculoDePersona({ vehicle_type: 'on_foot' })).toEqual({ estado: 'a_pie' });
    expect(vehiculoDePersona({ vehicle_type: 'bicycle' })).toEqual({ estado: 'bici_sin' });
    expect(vehiculoDePersona({ vehicle_type: 'car' })).toEqual({ estado: 'sin', tipo: 'car' });
  });
});

describe('migración con reversión', () => {
  it('existe la reversión y restaura las funciones de antes', () => {
    const r = fs.readFileSync(ROLLBACK, 'utf8');
    expect(r).toMatch(/drop table if exists public\.shipment_assignment_log/);
    expect(r).toMatch(/update public\.vehicles set status = 'available', current_driver_id = null/);
    expect(r).toMatch(/CREATE OR REPLACE FUNCTION public\.logistica_asignar_domiciliario\(p_shipment_id uuid, p_driver_id uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_fecha_estimada date DEFAULT NULL::date\)/);
  });

  it('el POS nunca se frena: la asignación va en un bloque que atrapa el error', () => {
    const f = MIGRACION.slice(MIGRACION.indexOf('create or replace function public.logistica_crear_envio_venta_pos'));
    expect(f).toMatch(/begin\s+v_r := public\.logistica_asignar_domiciliario\(v_id, p_driver_id, null, null\);[\s\S]*exception when others then/);
  });
});
