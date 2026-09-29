/**
 * Formulario de producto › tipo de servicio y «Configuración de membresía» (lógica pura):
 * validación, `payload.membresia` de fn_producto_guardar, lectura de fn_producto_para_formulario
 * y preselección desde la URL del botón «Nuevo plan».
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import {
  campoDeErrorRpc,
  construirPayload,
  estadoDesdeDatos,
  estadoInicial,
  esMembresia,
  primeraSeccionConError,
  validarFormulario,
  type EstadoFormularioProducto,
} from '@/components/inventario/productos/logica/formularioProducto';
import {
  horarioPayload,
  membresiaDesdeServidor,
  membresiaFormInicial,
  nombreDiaIso,
  normalizarHora,
  payloadMembresia,
  preseleccionDesdeUrl,
  presetDe,
  ultimoDiaEjemplo,
  validarMembresia,
  type MembresiaForm,
} from '@/components/inventario/productos/logica/membresiaProducto';
import { primerPasoConError, seccionesVisibles } from '@/components/inventario/productos/formulario/mapaSecciones';
import { leerBorrador } from '@/components/inventario/productos/formulario/useProductoForm';
import type { DatosFormularioProducto } from '@/lib/services/productoService';

function membresia(extra: Partial<MembresiaForm> = {}): MembresiaForm {
  return { ...membresiaFormInicial(), ...extra };
}

function estadoMembresia(extra: Partial<EstadoFormularioProducto> = {}): EstadoFormularioProducto {
  return {
    ...estadoInicial([]),
    sku: 'MEM-MENS-01',
    name: 'Plan mensual',
    product_type: 'service',
    service_type: 'membership',
    track_stock: false,
    price: 120000,
    ...extra,
  };
}

describe('validarMembresia', () => {
  it('el plan por defecto es válido (1 mes, por adelantado)', () => {
    const m = membresiaFormInicial();
    expect(m).toMatchObject({ duration_unit: 'month', duration_value: 1, billing_mode: 'prepaid', grace_days: 0 });
    expect(validarMembresia(m)).toEqual({});
  });

  it('duración entera ≥ 1', () => {
    expect(validarMembresia(membresia({ duration_value: 0 }))).toEqual({ membresia_duracion: 'membresia_duracion_invalida' });
    expect(validarMembresia(membresia({ duration_value: null }))).toEqual({ membresia_duracion: 'membresia_duracion_invalida' });
    expect(validarMembresia(membresia({ duration_value: 1.5 }))).toEqual({ membresia_duracion: 'membresia_duracion_invalida' });
  });

  it('gracia y topes ≥ 0 (vacío = sin tope)', () => {
    expect(validarMembresia(membresia({ grace_days: -1 }))).toEqual({ membresia_gracia: 'membresia_gracia_invalida' });
    expect(validarMembresia(membresia({ daily_checkin_limit: -2 }))).toEqual({ membresia_entradas: 'membresia_tope_invalido' });
    expect(validarMembresia(membresia({ freeze_allowed: true, freeze_max_days: -3 }))).toEqual({
      membresia_congelamiento: 'membresia_tope_invalido',
    });
    // Sin congelamiento, sus topes no cuentan (no se envían).
    expect(validarMembresia(membresia({ freeze_allowed: false, freeze_max_days: -3 }))).toEqual({});
    expect(validarMembresia(membresia({ freeze_allowed: true, freeze_max_times: null, freeze_max_days: null, daily_checkin_limit: 0 }))).toEqual({});
  });

  it('ventana de activación ≥ 1 solo si requiere activación', () => {
    expect(validarMembresia(membresia({ requires_activation: true, activation_window_days: 0 }))).toEqual({
      membresia_activacion: 'membresia_ventana_invalida',
    });
    expect(validarMembresia(membresia({ requires_activation: true, activation_window_days: null }))).toEqual({});
    expect(validarMembresia(membresia({ requires_activation: false, activation_window_days: 0 }))).toEqual({});
  });

  it('horario coherente: días, ambas horas o ninguna, desde < hasta', () => {
    const franja = (extra: Partial<MembresiaForm>) => validarMembresia(membresia({ horario: 'franja', ...extra }));
    expect(franja({ dias: [] })).toEqual({ membresia_horario: 'membresia_horario_dias' });
    expect(franja({ desde: '05:00', hasta: '10:00' })).toEqual({});
    expect(franja({ desde: '', hasta: '' })).toEqual({});
    expect(franja({ desde: '05:00', hasta: '' })).toEqual({ membresia_horario: 'membresia_horario_invalido' });
    expect(franja({ desde: '22:00', hasta: '06:00' })).toEqual({ membresia_horario: 'membresia_horario_invalido' });
    expect(franja({ desde: '10:00', hasta: '10:00' })).toEqual({ membresia_horario: 'membresia_horario_invalido' });
    expect(franja({ desde: '25:00', hasta: '26:00' })).toEqual({ membresia_horario: 'membresia_horario_invalido' });
    // «Todo el horario» ignora la franja.
    expect(validarMembresia(membresia({ horario: 'todo', dias: [], desde: 'x' }))).toEqual({});
  });
});

describe('validarFormulario con membresía', () => {
  it('una membresía no lleva variantes', () => {
    const e = estadoMembresia({ tiene_variantes: true });
    expect(validarFormulario(e, 'crear').service_type).toBe('membresia_con_variantes');
  });

  it('los errores de la membresía llevan a su sección y al paso 2 del móvil', () => {
    const err = validarFormulario(estadoMembresia({ membresia: membresia({ duration_value: 0 }) }), 'crear');
    expect(err).toEqual({ membresia_duracion: 'membresia_duracion_invalida' });
    expect(primeraSeccionConError(err)).toBe('membresia');
    expect(primerPasoConError(err)).toBe('inventario');
  });

  it('un servicio estándar no valida la membresía', () => {
    const e = estadoMembresia({ service_type: 'standard', membresia: membresia({ duration_value: 0 }) });
    expect(validarFormulario(e, 'crear')).toEqual({});
  });
});

describe('secciones visibles', () => {
  it('«Configuración de membresía» solo en servicio › membresía, entre impuestos e inventario', () => {
    const producto = seccionesVisibles(estadoInicial([]));
    expect(producto).not.toContain('membresia');
    expect(producto.indexOf('impuestos')).toBeLessThan(producto.indexOf('inventario'));
    const mem = seccionesVisibles(estadoMembresia());
    expect(mem).toContain('membresia');
    expect(mem).not.toContain('inventario');
    expect(mem.indexOf('membresia')).toBe(mem.indexOf('impuestos') + 1);
    expect(seccionesVisibles(estadoMembresia({ service_type: 'class' }))).not.toContain('membresia');
  });
});

describe('payload de fn_producto_guardar', () => {
  it('servicio: siempre lleva service_type; producto: null', () => {
    expect(construirPayload(estadoMembresia({ service_type: 'course' }), 'crear').producto.service_type).toBe('course');
    expect(construirPayload(estadoInicial([]), 'crear').producto.service_type).toBeNull();
  });

  it('membresía: payload.membresia con las claves del contrato', () => {
    const e = estadoMembresia({
      membresia: membresia({
        duration_unit: 'month',
        duration_value: 3,
        billing_mode: 'on_credit',
        grace_days: 3,
        requires_activation: true,
        activation_window_days: 30,
        freeze_allowed: true,
        freeze_max_times: 2,
        freeze_max_days: 15,
        allowed_branch_ids: [4, 7, 4],
        horario: 'franja',
        dias: [5, 1, 3],
        desde: '05:00',
        hasta: '10:00',
        daily_checkin_limit: 1,
      }),
    });
    expect(construirPayload(e, 'crear').membresia).toEqual({
      duration_unit: 'month',
      duration_value: 3,
      billing_mode: 'on_credit',
      renewal_mode: 'manual',
      grace_days: 3,
      requires_activation: true,
      activation_window_days: 30,
      freeze_allowed: true,
      freeze_max_times: 2,
      freeze_max_days: 15,
      allowed_branch_ids: [4, 7],
      access_schedule: { dias: [1, 3, 5], desde: '05:00', hasta: '10:00' },
      daily_checkin_limit: 1,
    });
  });

  it('lo apagado no viaja: sin activación ni congelamiento, sus números van null; «todo el horario» = null', () => {
    const p = payloadMembresia(
      membresia({ requires_activation: false, activation_window_days: 9, freeze_allowed: false, freeze_max_times: 2, grace_days: null }),
    );
    expect(p).toMatchObject({ activation_window_days: null, freeze_max_times: null, freeze_max_days: null, grace_days: 0, access_schedule: null });
    expect(horarioPayload(membresia({ horario: 'franja', dias: [6, 7] }))).toEqual({ dias: [6, 7] });
  });

  it('sin permiso de planes no se envía la configuración; tampoco si no es membresía', () => {
    expect(construirPayload(estadoMembresia(), 'crear', { conMembresia: false }).membresia).toBeUndefined();
    expect(construirPayload(estadoMembresia({ service_type: 'standard' }), 'crear').membresia).toBeUndefined();
    expect(construirPayload(estadoMembresia({ product_type: 'product' }), 'crear').membresia).toBeUndefined();
  });
});

describe('carga desde fn_producto_para_formulario', () => {
  const datos = (producto: Record<string, unknown>, membresiaSrv: DatosFormularioProducto['membresia']): DatosFormularioProducto => ({
    producto: { id: 9, uuid: 'u-9', sku: 'MEM-1', name: 'Plan anual', status: 'active', track_stock: false, ...producto },
    precio: { price: 1150000, compare_price: null, desde: '2026-09-01T05:00:00+00:00' },
    precio_programado: null,
    costo: null,
    impuestos: [],
    categorias_adicionales: [],
    categorias_por_regla: [],
    etiquetas: [],
    proveedores: [],
    stock: [],
    variantes: [],
    modificadores: [],
    imagenes: [],
    membresia: membresiaSrv,
  });

  const servidor = {
    plan_id: 3,
    duration_unit: 'year',
    duration_value: 1,
    billing_mode: 'on_credit',
    renewal_mode: 'manual',
    grace_days: 5,
    requires_activation: true,
    activation_window_days: 15,
    freeze_allowed: true,
    freeze_max_times: 1,
    freeze_max_days: 30,
    allowed_branch_ids: [2],
    access_schedule: { dias: [1, 2, 3, 4, 5], desde: '05:00:00', hasta: '10:00' },
    daily_checkin_limit: 2,
    membresias_vivas: 18,
  };

  it('editar: lee service_type y la configuración del plan', () => {
    const e = estadoDesdeDatos(datos({ product_type: 'service', service_type: 'membership' }, servidor), 'editar', { urlPublica: (r) => r });
    expect(esMembresia(e)).toBe(true);
    expect(e.membresia).toEqual({
      duration_unit: 'year',
      duration_value: 1,
      billing_mode: 'on_credit',
      grace_days: 5,
      requires_activation: true,
      activation_window_days: 15,
      freeze_allowed: true,
      freeze_max_times: 1,
      freeze_max_days: 30,
      allowed_branch_ids: [2],
      horario: 'franja',
      dias: [1, 2, 3, 4, 5],
      desde: '05:00',
      hasta: '10:00',
      daily_checkin_limit: 2,
    });
    // Ida y vuelta: lo leído se vuelve a enviar igual.
    expect(construirPayload(e, 'editar', { productId: 9 }).membresia?.access_schedule).toEqual({ dias: [1, 2, 3, 4, 5], desde: '05:00', hasta: '10:00' });
  });

  it('duplicar copia las reglas del plan', () => {
    const e = estadoDesdeDatos(datos({ product_type: 'service', service_type: 'membership' }, servidor), 'duplicar', { urlPublica: (r) => r });
    expect(e.membresia.duration_unit).toBe('year');
    expect(e.membresia.allowed_branch_ids).toEqual([2]);
  });

  it('sin plan o sin tipo: valores por defecto', () => {
    const e = estadoDesdeDatos(datos({ product_type: 'service' }, null), 'editar', { urlPublica: (r) => r });
    expect(e.service_type).toBe('standard');
    expect(e.membresia).toEqual(membresiaFormInicial());
    const raro = membresiaDesdeServidor({ ...servidor, duration_unit: 'fortnight', billing_mode: 'x', access_schedule: null, allowed_branch_ids: null });
    expect(raro).toMatchObject({ duration_unit: 'month', billing_mode: 'prepaid', horario: 'todo', allowed_branch_ids: [] });
  });

  it('un tipo desconocido cae en «standard»', () => {
    const e = estadoDesdeDatos(datos({ product_type: 'service', service_type: 'otro' }, null), 'editar', { urlPublica: (r) => r });
    expect(e.service_type).toBe('standard');
  });
});

describe('errores del servidor', () => {
  it('cada código nuevo marca su campo', () => {
    expect(campoDeErrorRpc('membresia_con_variantes')).toBe('service_type');
    expect(campoDeErrorRpc('membresia_con_contratos')).toBe('service_type');
    expect(campoDeErrorRpc('tipo_servicio_invalido')).toBe('service_type');
    expect(campoDeErrorRpc('membresia_unidad_invalida')).toBe('membresia_duracion');
    expect(campoDeErrorRpc('membresia_duracion_invalida')).toBe('membresia_duracion');
    expect(campoDeErrorRpc('membresia_cobro_invalido')).toBe('membresia_cobro');
    expect(campoDeErrorRpc('membresia_gracia_invalida')).toBe('membresia_gracia');
    expect(campoDeErrorRpc('membresia_sede_invalida')).toBe('membresia_sedes');
  });
});

describe('ayudas de pantalla', () => {
  it('preselección desde «Nuevo plan»', () => {
    expect(preseleccionDesdeUrl('?tipo=servicio&servicio=membresia')).toEqual({ product_type: 'service', service_type: 'membership' });
    expect(preseleccionDesdeUrl('tipo=servicio')).toEqual({ product_type: 'service', service_type: 'standard' });
    expect(preseleccionDesdeUrl('?servicio=cita')).toEqual({ product_type: 'service', service_type: 'appointment' });
    expect(preseleccionDesdeUrl('')).toBeNull();
    expect(preseleccionDesdeUrl('?tipo=producto')).toBeNull();
  });

  it('chips de duración', () => {
    expect(presetDe({ duration_unit: 'month', duration_value: 3 })).toBe('3m');
    expect(presetDe({ duration_unit: 'day', duration_value: 45 })).toBeNull();
  });

  it('ejemplo de vencimiento con la regla de la base (día D + N·unidad − 1)', () => {
    expect(ultimoDiaEjemplo('2026-09-28', 'month', 1)).toBe('2026-10-27');
    expect(ultimoDiaEjemplo('2026-01-31', 'month', 1)).toBe('2026-02-27');
    expect(ultimoDiaEjemplo('2026-09-28', 'day', 1)).toBe('2026-09-28');
    expect(ultimoDiaEjemplo('2026-09-28', 'year', 1)).toBe('2027-09-27');
    expect(ultimoDiaEjemplo('2026-09-28', 'week', 0)).toBeNull();
  });

  it('horas y días', () => {
    expect(normalizarHora('5:00')).toBe('05:00');
    expect(normalizarHora('05:00:00')).toBe('05:00');
    expect(nombreDiaIso(1, 'en-US', true)).toBe('Monday');
    expect(nombreDiaIso(7, 'en-US', true)).toBe('Sunday');
  });

  it('un borrador de antes del tipo de servicio se completa', () => {
    const viejo = { ...estadoInicial([]) } as Partial<EstadoFormularioProducto>;
    delete viejo.service_type;
    delete viejo.membresia;
    const e = leerBorrador(JSON.stringify(viejo));
    expect(e?.service_type).toBe('standard');
    expect(e?.membresia).toEqual(membresiaFormInicial());
  });
});
