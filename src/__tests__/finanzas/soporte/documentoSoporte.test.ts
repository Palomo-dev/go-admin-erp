/**
 * Documento soporte (Frente D, 2026-11-07): caracterización de las reglas de la
 * pantalla vieja (`SupportDocumentDetail.tsx`, `SupportDocumentForm.tsx`) que
 * la nueva conserva, y pruebas de la lógica nueva (estados, acciones,
 * proveedor, validación, rango, contrato y migración).
 */
// `compras/logica` → `taxResolver` carga el cliente del navegador al importarse.
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BADGE_DIAN,
  ESTADOS_SOPORTE,
  FILTROS_ESTADO,
  accionesSoporte,
  eliminarEnProveedorPrimero,
  envioVivo,
  estadoDian,
  estadoDocumento,
  estadoRango,
  faltantesProveedor,
  proveedorDesdeFila,
  textoBusquedaSeguro,
  validarFormularioSoporte,
  type DatosFormularioSoporte,
} from '@/lib/finanzas/soporte/soporteLogica';
import { codigoDianDeMedio, impuestosDeLineasSoporte, metodoOrganizacionDe, nombreMedioPago } from '@/lib/finanzas/soporte/detalleSoporteLogica';
import {
  codigoErrorSoporte,
  estadoHttpErrorSoporte,
  guardarSoporteSchema,
  ordenSoporte,
  parametrosListadoSoporteSchema,
} from '@/lib/finanzas/soporte/contratoSoporte';
import { mapearTipoDocADian } from '@/lib/utils/nitDv';
import { calcularLineaCompra } from '@/lib/services/compras/logica';

describe('caracterización: acciones de la pantalla vieja', () => {
  // SupportDocumentDetail.tsx (antes del 2026-11-07):
  //   canSendToDian = ['draft','failed','rejected'].includes(status)
  //   canDelete     = ['draft','failed','rejected'].includes(status)
  //   canDownload   = status === 'accepted' && number
  const viejo = (status: string, numero: string | null) => ({
    enviar: ['draft', 'failed', 'rejected'].includes(status),
    eliminar: ['draft', 'failed', 'rejected'].includes(status),
    xml: status === 'accepted' && !!numero,
  });

  it.each(ESTADOS_SOPORTE.flatMap((s) => [[s, null], [s, 'DS-12']] as Array<[string, string | null]>))('estado %s · número %s', (status, numero) => {
    const a = accionesSoporte({ status, numero });
    const v = viejo(status, numero);
    expect(a.has('enviar')).toBe(v.enviar);
    expect(a.has('eliminar')).toBe(v.eliminar);
    expect(a.has('xml')).toBe(v.xml);
  });

  it('eliminar un rechazado o con error borra primero en el proveedor; un borrador no', () => {
    expect(eliminarEnProveedorPrimero('failed')).toBe(true);
    expect(eliminarEnProveedorPrimero('rejected')).toBe(true);
    expect(eliminarEnProveedorPrimero('draft')).toBe(false);
  });

  it('el vendedor se arma con la misma regla que mapSupplierToProvider', () => {
    const p = proveedorDesdeFila(
      { id: 7, name: ' Transportes Ejemplo ', nit: '79456123', doc_type: 'national_id', supplier_type: 'person', address: 'Calle 1', dv: null, country_code: null },
      mapearTipoDocADian,
    );
    expect(p).toEqual({
      identification_document_code: mapearTipoDocADian('national_id'),
      identification: '79456123',
      names: 'Transportes Ejemplo',
      address: 'Calle 1',
      country_code: 'CO',
      legal_organization_code: '2',
    });
    // Código DIAN explícito manda; empresa → '1'; NIT por defecto '31'.
    expect(proveedorDesdeFila({ id: 1, name: 'X', identification_document_code: '31', supplier_type: 'company' }, mapearTipoDocADian)).toMatchObject({
      identification_document_code: '31',
      legal_organization_code: '1',
    });
    expect(proveedorDesdeFila({ id: 1, name: 'X' }, mapearTipoDocADian).identification_document_code).toBe('31');
  });

  it('lo que la DIAN exige del vendedor es lo que validaba el formulario viejo', () => {
    expect(faltantesProveedor({ identification: '1', names: 'A', address: 'B' })).toEqual([]);
    expect(faltantesProveedor({ identification: '', names: 'A', address: '' })).toEqual(['identificacion', 'direccion']);
    expect(faltantesProveedor(null)).toEqual(['identificacion', 'nombre', 'direccion']);
  });
});

describe('estados', () => {
  it('estado del documento', () => {
    expect(estadoDocumento('draft')).toBe('borrador');
    expect(estadoDocumento(null)).toBe('borrador');
    expect(estadoDocumento('cancelled')).toBe('anulado');
    for (const s of ['pending', 'processing', 'sent', 'accepted', 'rejected', 'failed']) expect(estadoDocumento(s)).toBe('emitido');
  });

  it('estado ante la DIAN, con el retenido aparte del pendiente', () => {
    expect(estadoDian('draft')).toBe('sin_enviar');
    expect(estadoDian('pending')).toBe('en_cola');
    expect(estadoDian('pending', true)).toBe('retenido');
    expect(estadoDian('accepted')).toBe('aceptado');
    expect(estadoDian('rejected')).toBe('rechazado');
    expect(estadoDian('failed')).toBe('error');
    expect(BADGE_DIAN.retenido).toBe('on hold');
  });

  it('editar exige que no haya un envío vivo', () => {
    expect(accionesSoporte({ status: 'rejected' }).has('editar')).toBe(true);
    expect(accionesSoporte({ status: 'rejected', estadoJob: 'pending' }).has('editar')).toBe(false);
    expect(accionesSoporte({ status: 'accepted' }).has('editar')).toBe(false);
    expect(envioVivo('processing')).toBe(true);
    expect(envioVivo('failed')).toBe(false);
  });

  it('los filtros de estado cubren todos los estados guardados', () => {
    const cubiertos = new Set(Object.values(FILTROS_ESTADO).flat());
    for (const s of ESTADOS_SOPORTE) expect(cubiertos.has(s)).toBe(true);
  });
});

describe('validación del formulario', () => {
  const base: DatosFormularioSoporte = {
    sucursal: 1,
    proveedorId: '7',
    faltantesProveedor: [],
    emision: '2026-11-07',
    formaPago: '1',
    medioPago: 'cash',
    vence: '',
    lineas: [{ key: 'a', description: 'Servicio', qty: 1, unit_price: 100, discount_amount: 0, tax_rate: 0 }],
  };

  it('un documento completo no tiene errores', () => {
    expect(validarFormularioSoporte(base)).toEqual({});
  });

  it('crédito exige vencimiento y que no sea antes de la emisión', () => {
    expect(validarFormularioSoporte({ ...base, formaPago: '2' }).vence).toBe('vence');
    expect(validarFormularioSoporte({ ...base, formaPago: '2', vence: '2026-11-01' }).vence).toBe('venceAntes');
    expect(validarFormularioSoporte({ ...base, formaPago: '2', vence: '2026-12-07' }).vence).toBeUndefined();
  });

  it('marca la línea y el vendedor incompleto', () => {
    const e = validarFormularioSoporte({
      ...base,
      faltantesProveedor: ['direccion'],
      lineas: [{ key: 'a', description: ' ', qty: 1, unit_price: 1, discount_amount: 0, tax_rate: 0 }, { key: 'b', description: 'x', qty: 1, unit_price: 10, discount_amount: 11, tax_rate: 0 }],
    });
    expect(e.proveedor).toBe('direccion');
    expect(e['linea.a']).toBe('descripcion');
    expect(e['linea.b']).toBe('precio');
    expect(validarFormularioSoporte({ ...base, lineas: [] }).lineas).toBe('sinLineas');
    expect(validarFormularioSoporte({ ...base, medioPago: '' }).medioPago).toBe('medioPago');
  });
});

describe('listado y búsqueda', () => {
  it('la búsqueda no rompe el filtro de PostgREST', () => {
    expect(textoBusquedaSeguro('DS-0012, (x)')).toBe('DS-0012 x');
    expect(textoBusquedaSeguro("a'b\"c*%")).toBe('a b c');
    expect(textoBusquedaSeguro('x'.repeat(100))).toHaveLength(60);
  });

  it('orden por lista blanca', () => {
    expect(ordenSoporte('total', 'asc')).toBe('total_asc');
    expect(ordenSoporte('drop table', 'asc')).toBe('fecha_asc');
    expect(ordenSoporte(undefined, undefined)).toBe('fecha_desc');
  });

  it('parámetros del listado: estado conocido y página acotada', () => {
    expect(parametrosListadoSoporteSchema.safeParse({ estado: 'aceptado', pagina: '2' }).success).toBe(true);
    expect(parametrosListadoSoporteSchema.safeParse({ estado: 'otro' }).success).toBe(false);
    expect(parametrosListadoSoporteSchema.safeParse({ tamano: '1000' }).success).toBe(false);
  });
});

describe('contrato', () => {
  it('el cuerpo de guardar no admite organización ni vendedor armado por el cliente', () => {
    const ok = guardarSoporteSchema.safeParse({
      branch_id: 1,
      supplier_id: 7,
      issue_date: '2026-11-07',
      payment_form: '1',
      payment_method: 'cash',
      items: [{ description: 'Servicio', qty: 1, unit_price: 100 }],
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect('provider' in ok.data).toBe(false);
    expect(guardarSoporteSchema.safeParse({ branch_id: 1, supplier_id: 7, issue_date: '07/11/2026', payment_form: '1', payment_method: 'cash', items: [] }).success).toBe(false);
  });

  it('errores de la base → códigos estables', () => {
    expect(codigoErrorSoporte({ message: 'documento_no_editable' })).toBe('documento_no_editable');
    expect(codigoErrorSoporte({ message: 'Acceso denegado a la organización 5' })).toBe('documento_no_encontrado');
    expect(codigoErrorSoporte({ code: 'PGRST202', message: 'Could not find the function public.fn_documento_soporte_guardar' })).toBe('migracion_pendiente');
    expect(codigoErrorSoporte({ message: 'algo raro' })).toBe('error_desconocido');
    expect(estadoHttpErrorSoporte('migracion_pendiente')).toBe(503);
    expect(estadoHttpErrorSoporte('documento_en_envio')).toBe(409);
    expect(estadoHttpErrorSoporte('sin_permiso')).toBe(403);
  });
});

describe('detalle', () => {
  it('impuestos por tarifa con la regla de la línea de compra', () => {
    const lineas = [
      { cantidad: 2, precioUnitario: 320000, descuento: 0, tarifa: 19 },
      { cantidad: 1, precioUnitario: 180000, descuento: 0, tarifa: 8 },
      { cantidad: 1, precioUnitario: 1000, descuento: 0, tarifa: 0 },
    ];
    const r = impuestosDeLineasSoporte(lineas, false);
    expect(r.map((x) => x.tarifa)).toEqual([8, 19]);
    expect(r[1]).toEqual({ tarifa: 19, base: 640000, importe: calcularLineaCompra({ qty: 2, unit_price: 320000, tax_rate: 19 }, false).impuesto });
    const incluido = impuestosDeLineasSoporte([{ cantidad: 1, precioUnitario: 119, descuento: 0, tarifa: 19 }], true);
    expect(incluido[0].base + incluido[0].importe).toBeCloseTo(119, 2);
  });

  it('medio de pago: código DIAN o el interno de documentos viejos', () => {
    expect(codigoDianDeMedio('47')).toBe('47');
    expect(codigoDianDeMedio('transfer')).toBe('47');
    expect(codigoDianDeMedio('cash')).toBe('10');
    const traducir = (k: string) => ({ '47': 'Transferencia' } as Record<string, string>)[k] ?? null;
    expect(nombreMedioPago('transfer', traducir)).toBe('Transferencia');
    expect(nombreMedioPago('20', traducir)).toBe('20');
    expect(metodoOrganizacionDe('47', [{ codigo: 'cash' }, { codigo: 'transfer' }])).toBe('transfer');
    expect(metodoOrganizacionDe(null, [{ codigo: 'cash' }])).toBe('');
  });
});

describe('resolución que se usará', () => {
  const r = { prefix: 'DS', range_start: 1, range_end: 500, current_number: 462, valid_until: '2027-03-02', alert_threshold: 50 };
  it('consumo y quedan', () => {
    const e = estadoRango(r, '2026-11-07');
    expect(e).toMatchObject({ usados: 462, total: 500, quedan: 38, porcentaje: 92, tono: 'por_agotar' });
  });
  it('vencido manda sobre agotado', () => {
    expect(estadoRango({ ...r, valid_until: '2026-11-01' }, '2026-11-07').tono).toBe('vencido');
    expect(estadoRango({ ...r, current_number: 500 }, '2026-11-07').tono).toBe('agotado');
    expect(estadoRango({ ...r, current_number: 10, valid_until: '2026-11-20' }, '2026-11-07').tono).toBe('por_vencer');
    expect(estadoRango({ ...r, current_number: 10 }, '2026-11-07').tono).toBe('ok');
  });
});

describe('migración 20261108020000 (escrita, sin aplicar)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261108020000_documento_soporte_guardar.sql'), 'utf8');
  const rollback = readFileSync(join(process.cwd(), 'supabase/rollbacks/20261108020000_documento_soporte_guardar_rollback.sql'), 'utf8');

  it('admite líneas de documento soporte sin quitarle nada a venta y compra', () => {
    expect(sql).toMatch(/'sale'::text, 'purchase'::text, 'support_document'::text/);
    expect(sql).toMatch(/invoice_type = 'support_document' and support_document_id is not null/);
  });

  it('la RPC exige permiso, pertenencia de vendedor y sucursal, y no se abre a anon', () => {
    expect(sql).toMatch(/fn_finanzas_exigir_permiso\(p_org, array\['finance.create'\]\)/);
    expect(sql).toMatch(/app_branch_access\(v_branch\)/);
    expect(sql).toMatch(/revoke all on function public\.fn_documento_soporte_guardar\(integer, uuid, jsonb\) from public, anon/);
    expect(sql).not.toMatch(/to anon/);
  });

  it('la reversión quita las funciones y la política', () => {
    expect(rollback).toMatch(/drop function if exists public\.fn_documento_soporte_guardar/);
    expect(rollback).toMatch(/drop policy if exists invoice_items_soporte_select/);
  });
});

describe('documento nacido de una factura de compra', () => {
  it('se envía, pero no se edita ni se borra (sus líneas son las de la compra)', () => {
    const a = accionesSoporte({ status: 'draft', deCompra: true });
    expect(a.has('enviar')).toBe(true);
    expect(a.has('editar')).toBe(false);
    expect(a.has('eliminar')).toBe(false);
    expect(estadoHttpErrorSoporte('documento_de_compra')).toBe(409);
  });

  it('la RPC no reemplaza líneas que no son del documento soporte', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261108020000_documento_soporte_guardar.sql'), 'utf8');
    expect(sql).toMatch(/raise exception 'documento_de_compra'/);
    expect(sql).toMatch(/delete from public\.invoice_items where support_document_id = v_id and invoice_type = 'support_document'/);
  });
});
