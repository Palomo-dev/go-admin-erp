/**
 * Certificado de retenciones practicadas a un proveedor (art. 381 E.T.).
 *
 * El cálculo NO se repite aquí: sale de `fn_certificado_retenciones_proveedor`,
 * que lee las mismas filas que el reporte de retenciones practicadas
 * (`fn_retenciones_practicadas_filas`): retenciones de facturas de compra
 * confirmadas, con la cuenta del asiento real (o la que resolvería el asiento)
 * y la clase de `fn_clase_retencion`. La función exige `finance.view` en la
 * base; el motor lo exige antes en el servidor.
 *
 * El agente retenedor es la organización, no la sucursal: el certificado
 * cubre todas las sucursales. El periodo son días calendario de la zona de la
 * organización; por defecto, del 1 de enero del año del corte hasta hoy.
 *
 * El número (`CR-<año>-<proveedor>`) es determinista y se puede reexpedir: no
 * es un consecutivo de la DIAN.
 */

import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { toPlainDate } from '@/lib/utils/dateCore';
import type { Traductor } from '../../textos';
import type { Campo, CeldaTabla, DocumentoPayload, FilaTotal } from '../../tipos';
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
const CLASES = ['retefuente', 'reteiva', 'reteica'] as const;

interface ConceptoCertificado {
  clase: string | null;
  concepto: string | null;
  cuenta: string | null;
  tarifa: number | string | null;
  base: number | string | null;
  valor: number | string | null;
}

interface FacturaCertificado {
  numero: string | null;
  dia: string | null;
  valor: number | string | null;
}

interface RespuestaCertificado {
  conceptos?: ConceptoCertificado[] | null;
  facturas?: FacturaCertificado[] | null;
  totales?: Partial<Record<'retenido' | (typeof CLASES)[number], number | string | null>> | null;
}

/** Periodo del certificado: `hasta` ≤ hoy; `desde` ≤ `hasta`, o el 1 de enero del año de `hasta`. */
export function periodoCertificado(opciones: Pick<OpcionesCarga, 'desde' | 'hasta'>, hoy: string): { desde: string; hasta: string } {
  const hasta = opciones.hasta && FECHA_RE.test(opciones.hasta) && opciones.hasta <= hoy ? opciones.hasta : hoy;
  const desde = opciones.desde && FECHA_RE.test(opciones.desde) && opciones.desde <= hasta ? opciones.desde : `${hasta.slice(0, 4)}-01-01`;
  return { desde, hasta };
}

export async function cargarCertificadoRetenciones(
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
  const { desde, hasta } = periodoCertificado(opciones, hoy);

  const { data: rpc, error: errorRpc } = await db.rpc('fn_certificado_retenciones_proveedor', {
    p_organization_id: sesion.organizationId,
    p_supplier_id: id,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (errorRpc) {
    if ((errorRpc as { code?: string }).code === 'P0002') throw noEncontrado();
    fallaLectura('fn_certificado_retenciones_proveedor', errorRpc);
  }
  const r = (rpc ?? {}) as RespuestaCertificado;
  // Las retenciones se declaran en la moneda base de la organización.
  const moneda = await resolverContextoMoneda(db, sesion.organizationId, null);

  const conceptos = r.conceptos ?? [];
  const facturas = r.facturas ?? [];
  const totales = r.totales ?? {};
  const retenido = num(totales.retenido);
  const clasesPresentes = new Set(conceptos.map((c) => texto(c.clase)).filter(Boolean));
  const declaradoEn = clasesPresentes.has('reteica')
    ? clasesPresentes.size > 1 ? 'certificado.declarado350EIca' : 'certificado.declaradoIca'
    : 'certificado.declarado350';

  const metadatos: Campo[] = [
    { clave: 'periodoDesde', valor: { tipo: 'fecha', v: desde } },
    { clave: 'periodoHasta', valor: { tipo: 'fecha', v: hasta } },
    { clave: 'facturasIncluidas', valor: { tipo: 'numero', v: facturas.length, decimales: 0 } },
    { clave: 'fechaExpedicion', valor: { tipo: 'fecha', v: hoy } },
  ];
  if (base.emisor.ciudad) metadatos.push({ clave: 'ciudadExpedicion', valor: { tipo: 'texto', v: base.emisor.ciudad } });
  metadatos.push(
    { clave: 'moneda', valor: { tipo: 'texto', v: moneda.code } },
    { clave: 'declaradoEn', valor: { tipo: 'clave', v: declaradoEn } },
  );

  const filasTotales: FilaTotal[] = CLASES.filter((clase) => num(totales[clase]) !== 0).map((clase) => ({
    clave: clase,
    valor: num(totales[clase]),
  }));
  filasTotales.push({ clave: 'totalRetenido', valor: retenido, estilo: 'total' });

  const contraparte = contraparteProveedor(proveedor);
  const numero = `${t('certificado.prefijo')}-${hasta.slice(0, 4)}-${String(id).padStart(4, '0')}`;

  return {
    tipo: 'certificado-retenciones',
    tituloClave: 'certificado-retenciones',
    idioma: opciones.idioma,
    numero,
    estado: null,
    marcaAgua: null,
    bandas: [],
    emisor: base.emisor,
    sucursal: null,
    contraparte,
    referencia: [],
    metadatos,
    resumen: [],
    lineas: null,
    secciones: [
      {
        titulo: 'conceptosRetenidos',
        columnas: [
          { clave: 'concepto', tipo: 'texto' },
          { clave: 'cuenta', tipo: 'texto' },
          { clave: 'base', tipo: 'dinero' },
          { clave: 'tarifa', tipo: 'numero' },
          { clave: 'valorRetenido', tipo: 'dinero' },
        ],
        filas: conceptos.map((c) => [texto(c.concepto), texto(c.cuenta), num(c.base), num(c.tarifa), num(c.valor)] as CeldaTabla[]),
        pie: conceptos.length > 0 ? [t('certificado.totalRetenido'), null, null, null, retenido] : undefined,
        vacio: 'retencionesPeriodo',
      },
      {
        titulo: 'facturasIncluidas',
        columnas: [
          // `dia`: el día de emisión ya resuelto en la zona de la organización.
          { clave: 'fecha', tipo: 'fecha' },
          { clave: 'documento', tipo: 'texto' },
          { clave: 'valorRetenido', tipo: 'dinero' },
        ],
        filas: facturas.map((f) => [f.dia, texto(f.numero), num(f.valor)] as CeldaTabla[]),
      },
    ],
    totales: filasTotales,
    notas: t('certificado.constancia', {
      emisor: base.emisor.razonSocial ?? base.emisor.nombre,
      proveedor: contraparte?.nombre ?? '',
    }),
    terminos: null,
    firma: 'retenedorContador',
    pieLegal: { textos: textoLegal(base, 'certificado-retenciones', t), resolucion: null, codigoUnico: null, qr: null },
    sobrio: false,
    moneda,
    zonaHoraria: base.zonaHoraria,
    generadoEn: ahora.toISOString(),
    nombreArchivo: nombreArchivoBase(t, 'certificado-retenciones', numero),
  };
}
