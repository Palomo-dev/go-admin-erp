/**
 * Estado de cuenta de un proveedor — simétrico al de cliente.
 *
 * El cálculo NO se repite aquí: sale de `fn_estado_cuenta_proveedor` (plan de
 * compras F1.8 / F9), la misma función que usan la pantalla y el CSV: cargos por
 * el NETO de cada factura confirmada (total − retenciones), cuentas por pagar
 * sin factura, abonos por los pagos de los dos orígenes (`amount +
 * discount_amount`), saldo inicial antes de `desde`, saldo corrido y vencido /
 * por vencer con el día de la organización. La función exige `finance.view` en
 * la base; el motor lo exige antes en el servidor.
 *
 * El proveedor se busca primero con la organización de la sesión: si es de
 * otra, no existe o el id no es válido → 404 (sin llamar a la RPC).
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { toPlainDate } from '@/lib/utils/dateCore';
import type { Traductor } from '../../textos';
import type { CeldaTabla, DocumentoPayload } from '../../tipos';
import {
  SELECT_PROVEEDOR,
  cargarBase,
  contraparteProveedor,
  exigirEntero,
  fallaLectura,
  nombreArchivoBase,
  noEncontrado,
  num,
  textoLegal,
  texto,
  type FilaProveedor,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface MovimientoProveedor {
  fecha: string | null;
  dia: string | null;
  tipo: string;
  documento: string | null;
  vence: string | null;
  cargo: number | string | null;
  abono: number | string | null;
  saldo: number | string | null;
}

interface RespuestaEstadoCuenta {
  moneda?: string | null;
  saldo_inicial?: number | string | null;
  movimientos?: MovimientoProveedor[] | null;
  total_cargos?: number | string | null;
  total_abonos?: number | string | null;
  saldo_final?: number | string | null;
  vencido?: number | string | null;
  por_vencer?: number | string | null;
}

export async function cargarEstadoCuentaProveedor(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const id = exigirEntero(idCrudo);
  const db = sesion.supabase;
  const { data: fila, error } = await db
    .from('suppliers')
    .select(`id, organization_id, ${SELECT_PROVEEDOR}`)
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('suppliers', error);
  const proveedor = fila as (FilaProveedor & { id: number; organization_id: number }) | null;
  if (!proveedor || proveedor.organization_id !== sesion.organizationId) throw noEncontrado();

  const base = await cargarBase(sesion, null);
  const ahora = opciones.ahora ?? new Date();
  const hoy = toPlainDate(ahora, base.zonaHoraria);
  const hasta = opciones.hasta && FECHA_RE.test(opciones.hasta) && opciones.hasta <= hoy ? opciones.hasta : hoy;
  const desde = opciones.desde && FECHA_RE.test(opciones.desde) && opciones.desde <= hasta ? opciones.desde : null;

  const { data: rpc, error: errorRpc } = await db.rpc('fn_estado_cuenta_proveedor', {
    p_org: sesion.organizationId,
    p_supplier: id,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (errorRpc) {
    if ((errorRpc as { code?: string }).code === 'P0002') throw noEncontrado();
    fallaLectura('fn_estado_cuenta_proveedor', errorRpc);
  }
  const r = (rpc ?? {}) as RespuestaEstadoCuenta;
  const moneda = await resolverContextoMoneda(db, sesion.organizationId, texto(r.moneda));

  const movimientos = (r.movimientos ?? []).map(
    (m) => [m.dia, `movimientosProveedor.${m.tipo}`, texto(m.documento), m.vence, num(m.cargo) || null, num(m.abono) || null, num(m.saldo)] as CeldaTabla[],
  );

  return {
    tipo: 'estado-cuenta-proveedor',
    tituloClave: 'estado-cuenta-proveedor',
    idioma: opciones.idioma,
    numero: `${t('estadoCuenta.prefijoProveedor')}-${hasta.replace(/-/g, '')}`,
    estado: null,
    marcaAgua: null,
    bandas: [],
    emisor: base.emisor,
    sucursal: null,
    contraparte: contraparteProveedor(proveedor),
    referencia: [],
    metadatos: [
      { clave: 'desde', valor: desde ? { tipo: 'fecha', v: desde } : { tipo: 'clave', v: 'estadoCuenta.desdeInicio' } },
      { clave: 'fechaCorte', valor: { tipo: 'fecha', v: hasta } },
      { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
    ],
    resumen: [
      { clave: 'saldoInicial', valor: { tipo: 'dinero', v: num(r.saldo_inicial) } },
      { clave: 'cargos', valor: { tipo: 'dinero', v: num(r.total_cargos) } },
      { clave: 'abonos', valor: { tipo: 'dinero', v: num(r.total_abonos) } },
      { clave: 'saldoFinal', valor: { tipo: 'dinero', v: num(r.saldo_final) } },
      { clave: 'vencido', valor: { tipo: 'dinero', v: num(r.vencido) } },
      { clave: 'porVencer', valor: { tipo: 'dinero', v: num(r.por_vencer) } },
    ],
    lineas: null,
    secciones: [
      {
        titulo: 'movimientos',
        columnas: [
          // `dia` y `vence`: el día ya viene resuelto en la zona de la organización (columna date / día calendario).
          { clave: 'fecha', tipo: 'fecha' },
          { clave: 'concepto', tipo: 'clave' },
          { clave: 'documento', tipo: 'texto' },
          { clave: 'vencimiento', tipo: 'instante' },
          { clave: 'cargo', tipo: 'dinero' },
          { clave: 'abono', tipo: 'dinero' },
          { clave: 'saldo', tipo: 'dinero' },
        ],
        filas: movimientos,
        pie: [null, 'movimientos.totales', null, null, num(r.total_cargos), num(r.total_abonos), num(r.saldo_final)],
        vacio: 'movimientos',
      },
    ],
    totales: [],
    notas: null,
    terminos: null,
    firma: null,
    pieLegal: { textos: textoLegal(base, 'estado-cuenta-proveedor', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: ahora.toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'estado-cuenta-proveedor', hasta),
  };
}
