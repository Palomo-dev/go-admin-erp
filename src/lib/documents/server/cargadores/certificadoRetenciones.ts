/**
 * Certificado de retenciones practicadas a un proveedor (art. 381 E.T.),
 * Figma 09 · «Certificado de retenciones (Nuevo · propuesta)» 1491:126182.
 *
 * Dos entradas por la misma ruta del motor:
 * - `id` = uuid de `withholding_certificates`: el certificado EXPEDIDO. Número
 *   de la serie CR de la organización (`CR-<año>-<consecutivo>`), estado
 *   «Expedido» y la foto de conceptos que guardó
 *   `fn_certificado_retenciones_expedir`: reimprimirlo da siempre lo mismo.
 * - `id` = id del proveedor (entero): VISTA PREVIA del periodo `desde`/`hasta`,
 *   sin número y con marca de agua «Borrador», calculada al vuelo.
 *
 * El cálculo NO se repite aquí: los conceptos salen de
 * `fn_certificado_retenciones_proveedor` (retenciones de facturas de compra
 * confirmadas, agrupadas por concepto, con la cuenta del asiento de cada
 * factura). La función exige `finance.view` en la base; el motor lo exige
 * antes en el servidor.
 *
 * El agente retenedor es la organización: el certificado cubre todas las
 * sucursales. La sucursal (la del documento de origen) solo da la tarjeta
 * «Sucursal» y la «Ciudad de la retención».
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { toPlainDate } from '@/lib/utils/dateCore';
import {
  capitalizar,
  claveConstancia,
  claveDeclaradoEn,
  resumirValoresRetenidos,
  textoPeriodo,
  textoTarifa,
  type ConceptoRetenido,
} from '../../certificadoRetenciones';
import { crearFormateador } from '../../formato';
import type { Traductor } from '../../textos';
import type { Campo, CeldaTabla, DocumentoPayload, MarcaAgua, Tono } from '../../tipos';
import {
  SELECT_PROVEEDOR,
  cargarBase,
  contraparteProveedor,
  esUuid,
  exigirEntero,
  fallaLectura,
  nombreArchivoBase,
  noEncontrado,
  num,
  textoLegal,
  type FilaProveedor,
  type OpcionesCarga,
  type SesionDocumento,
} from '../base';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RespuestaCertificado {
  conceptos?: ConceptoRetenido[] | null;
  facturas?: unknown[] | null;
}

interface FilaCertificado {
  id: string;
  organization_id: number;
  branch_id: number | null;
  supplier_id: number;
  number: string;
  period_from: string;
  period_to: string;
  invoice_count: number | null;
  concepts: ConceptoRetenido[] | null;
  status: string;
  issued_at: string;
}

/** Periodo de la vista previa: `hasta` ≤ hoy; `desde` ≤ `hasta`, o el 1 de enero del año de `hasta`. */
export function periodoCertificado(opciones: Pick<OpcionesCarga, 'desde' | 'hasta'>, hoy: string): { desde: string; hasta: string } {
  const hasta = opciones.hasta && FECHA_RE.test(opciones.hasta) && opciones.hasta <= hoy ? opciones.hasta : hoy;
  const desde = opciones.desde && FECHA_RE.test(opciones.desde) && opciones.desde <= hasta ? opciones.desde : `${hasta.slice(0, 4)}-01-01`;
  return { desde, hasta };
}

/** Sucursal de la vista previa (`?sucursal=`): entero o nada. `cargarBase` la filtra por la organización. */
function sucursalDeParametros(opciones: OpcionesCarga): number | null {
  const crudo = opciones.parametros?.sucursal;
  return crudo && /^\d{1,9}$/.test(crudo) && Number(crudo) > 0 ? Number(crudo) : null;
}

async function leerProveedor(sesion: SesionDocumento, id: number): Promise<FilaProveedor> {
  const { data, error } = await sesion.supabase
    .from('suppliers')
    .select(`id, organization_id, ${SELECT_PROVEEDOR}`)
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('suppliers', error);
  const proveedor = data as (FilaProveedor & { id: number; organization_id: number }) | null;
  if (!proveedor || proveedor.organization_id !== sesion.organizationId) throw noEncontrado();
  return proveedor;
}

interface DatosCertificado {
  numero: string | null;
  estado: { codigo: string; tono: Tono };
  marcaAgua: MarcaAgua | null;
  proveedorId: number;
  /** Solo el expedido la guarda; la vista previa la toma de `?sucursal=`. */
  sucursalId?: number | null;
  desde: string | null;
  hasta: string | null;
  facturas: number;
  conceptos: ConceptoRetenido[];
  /** Expedido: instante de expedición. Vista previa: null (se expide hoy). */
  expedidoEn: string | null;
}

async function datosExpedido(sesion: SesionDocumento, id: string): Promise<DatosCertificado> {
  const { data, error } = await sesion.supabase
    .from('withholding_certificates')
    .select('id, organization_id, branch_id, supplier_id, number, period_from, period_to, invoice_count, concepts, status, issued_at')
    .eq('id', id)
    .eq('organization_id', sesion.organizationId)
    .maybeSingle();
  if (error) fallaLectura('withholding_certificates', error);
  const c = data as FilaCertificado | null;
  if (!c || c.organization_id !== sesion.organizationId) throw noEncontrado();
  const anulado = c.status === 'void';
  return {
    numero: c.number,
    estado: anulado ? { codigo: 'certificado.void', tono: 'peligro' } : { codigo: 'certificado.issued', tono: 'exito' },
    marcaAgua: anulado ? 'anulada' : null,
    proveedorId: c.supplier_id,
    sucursalId: c.branch_id,
    desde: c.period_from,
    hasta: c.period_to,
    facturas: num(c.invoice_count),
    conceptos: Array.isArray(c.concepts) ? c.concepts : [],
    expedidoEn: c.issued_at,
  };
}

async function datosVistaPrevia(sesion: SesionDocumento, proveedorId: number, desde: string, hasta: string): Promise<DatosCertificado> {
  const { data, error } = await sesion.supabase.rpc('fn_certificado_retenciones_proveedor', {
    p_organization_id: sesion.organizationId,
    p_supplier_id: proveedorId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    if ((error as { code?: string }).code === 'P0002') throw noEncontrado();
    fallaLectura('fn_certificado_retenciones_proveedor', error);
  }
  const r = (data ?? {}) as RespuestaCertificado;
  return {
    numero: null,
    estado: { codigo: 'certificado.preview', tono: 'neutro' },
    marcaAgua: 'borrador',
    proveedorId,
    desde,
    hasta,
    facturas: Array.isArray(r.facturas) ? r.facturas.length : 0,
    conceptos: r.conceptos ?? [],
    expedidoEn: null,
  };
}

export async function cargarCertificadoRetenciones(
  sesion: SesionDocumento,
  idCrudo: string,
  opciones: OpcionesCarga,
  t: Traductor,
): Promise<DocumentoPayload> {
  const ahora = opciones.ahora ?? new Date();
  let datos: DatosCertificado;
  let proveedor: FilaProveedor;
  let base: Awaited<ReturnType<typeof cargarBase>>;
  if (esUuid(idCrudo)) {
    datos = await datosExpedido(sesion, idCrudo.toLowerCase());
    proveedor = await leerProveedor(sesion, datos.proveedorId);
    base = await cargarBase(sesion, datos.sucursalId ?? null);
  } else {
    const proveedorId = exigirEntero(idCrudo);
    proveedor = await leerProveedor(sesion, proveedorId);
    base = await cargarBase(sesion, sucursalDeParametros(opciones));
    const { desde, hasta } = periodoCertificado(opciones, toPlainDate(ahora, base.zonaHoraria));
    datos = await datosVistaPrevia(sesion, proveedorId, desde, hasta);
  }

  // Las retenciones se practican y declaran en la moneda base de la organización.
  const moneda = await resolverContextoMoneda(sesion.supabase, sesion.organizationId, null);
  const f = crearFormateador({ moneda, zonaHoraria: base.zonaHoraria, idioma: opciones.idioma });
  const diaExpedicion = toPlainDate(datos.expedidoEn ? new Date(datos.expedidoEn) : ahora, base.zonaHoraria);
  const desde = datos.desde ?? diaExpedicion;
  const hasta = datos.hasta ?? diaExpedicion;
  const periodo = textoPeriodo(desde, hasta, opciones.idioma, t, f, diaExpedicion);

  const resumen = resumirValoresRetenidos(datos.conceptos);
  const ciudad = base.sucursal?.ciudad ?? base.emisor.ciudad;
  const contraparte = contraparteProveedor(proveedor);

  const referencia: Campo[] = [
    { clave: 'periodoCertificado', valor: { tipo: 'texto', v: capitalizar(periodo) } },
    {
      clave: 'facturasIncluidas',
      valor: { tipo: 'clave', v: datos.facturas === 1 ? 'certificado.facturaCompra' : 'certificado.facturasCompra', vars: { n: f.numero(datos.facturas, 0) } },
    },
  ];
  const metadatos: Campo[] = [
    datos.expedidoEn
      ? { clave: 'fechaExpedicion', valor: { tipo: 'instante', v: datos.expedidoEn } }
      : { clave: 'fechaExpedicion', valor: { tipo: 'fecha', v: diaExpedicion } },
  ];
  if (ciudad) metadatos.push({ clave: 'ciudadRetencion', valor: { tipo: 'texto', v: ciudad } });
  metadatos.push(
    { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
    { clave: 'declaradoEn', valor: { tipo: 'clave', v: claveDeclaradoEn(resumen.clases) } },
  );

  const emisor = base.emisor.nombre || base.emisor.razonSocial || '';

  return {
    tipo: 'certificado-retenciones',
    tituloClave: 'certificado-retenciones',
    idioma: opciones.idioma,
    numero: datos.numero,
    estado: datos.estado,
    marcaAgua: datos.marcaAgua,
    bandas: [],
    emisor: base.emisor,
    sucursal: base.sucursal,
    contraparte,
    referencia,
    metadatos,
    resumen: [],
    lineas: null,
    secciones: [
      {
        titulo: 'valoresRetenidos',
        tituloTexto: t('secciones.valoresRetenidosPeriodo', { periodo }),
        columnas: [
          { clave: 'concepto', tipo: 'texto' },
          { clave: 'cuenta', tipo: 'texto' },
          { clave: 'base', tipo: 'dinero' },
          // Texto ya formateado: «2,5 %» o, en el ICA, «7 ‰».
          { clave: 'tarifaRetencion', tipo: 'texto', alinear: 'derecha' },
          { clave: 'valorRetenido', tipo: 'dinero' },
        ],
        filas: resumen.filas.map((r) => [r.concepto, r.cuenta, r.base, textoTarifa(r.clase, r.tarifa, f), r.valor] as CeldaTabla[]),
        pie: resumen.filas.length > 0 ? [t('certificado.totalRetenido'), null, null, null, resumen.total] : undefined,
        vacio: 'retencionesPeriodo',
      },
    ],
    // El total va en la fila «Total retenido» de la tabla (diseño): sin bloque de totales aparte.
    totales: [],
    notas: t(claveConstancia(resumen.clases), {
      emisor,
      municipio: ciudad ? t('certificado.municipioDe', { ciudad }) : t('certificado.municipioSinCiudad'),
    }),
    terminos: null,
    firma: 'retenedorContador',
    pieLegal: { textos: textoLegal(base, 'certificado-retenciones', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: ahora.toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'certificado-retenciones', datos.numero ?? t('certificado.vistaPrevia')),
  };
}
