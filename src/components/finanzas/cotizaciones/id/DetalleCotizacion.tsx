'use client';

/**
 * Detalle de una cotización (Figma «Finanzas — Documentos v2»: enviada
 * `1022:94293`, vencida `1022:95217`, convertida `1022:96025`; móvil en una
 * columna con la primaria en la cabecera). Molde de `DetalleFacturaVenta`:
 * `DocumentoCabecera` + `DocumentoLineas` (lectura) + `DocumentoTotales`
 * (cotización: sin pagado ni saldo) + `Tarjeta`/`FilaDato`, y a la derecha
 * «Respuesta del cliente», la cadena Oportunidad → Cotización → Factura y el
 * historial.
 *
 * Lee `GET /api/cotizaciones/[id]` (organización de la sesión, estado vivo
 * con «vencida» derivada en la base). Todas las acciones van a las rutas que
 * ya existían — nada se escribe desde el navegador:
 * enviar (`/enviar`, correo con el PDF del motor), marcar aceptada o
 * rechazada (`/estado`), convertir en factura BORRADOR (`/convertir`),
 * duplicar (`/duplicar`, también «con vigencia desde hoy» para la vencida),
 * eliminar borrador (DELETE), editar (borrador o enviada) e imprimir / PDF
 * por el motor de documentos. Las reglas por estado: `accionesCotizacion`.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Copy, Download, FileCheck2, FileText, MailCheck, Pencil, Printer, Send, Trash2, TriangleAlert, X, XCircle } from 'lucide-react';
import {
  AvisoTonal,
  CadenaDocumento,
  Dialogo,
  DocumentoCabecera,
  DocumentoLineas,
  DocumentoTotales,
  EmptyState,
  FilaDato,
  ListaDatos,
  RowActionsMenu,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type AccionFila,
  type EslabonDocumento,
  type LineaDocumento,
} from '@/components/kit';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { CotizacionesService, ErrorPeticionCotizacion } from '@/lib/services/cotizacionesService';
import type { CotizacionDetalle } from '@/lib/finanzas/ventas/contratoCotizaciones';
import {
  RUTA_COTIZACIONES,
  accionesCotizacion,
  diasEntre,
  estadoBadgeCotizacion,
  impuestosPorTarifa,
  vigenciaDe,
  type AccionCotizacion,
} from '@/lib/finanzas/ventas/listadoCotizaciones';
import { EnviarDocumentoDialog } from '@/components/finanzas/documento/EnviarDocumentoDialog';
import { ConvertirCotizacionDialog } from '../detalle/ConvertirCotizacionDialog';
import { nombreImpuesto } from '../detalle/textoCotizacion';
import { useMensajeErrorCotizacion } from '../detalle/useMensajeErrorCotizacion';

const RUTA_FACTURA = '/app/finanzas/facturas-venta';

export interface DetalleCotizacionProps {
  /** Id de la cotización: el detalle la lee del servidor. */
  id?: string;
  /** Datos ya leídos (pruebas o una página que ya los tenga). */
  cotizacion?: CotizacionDetalle;
}

export function DetalleCotizacion({ id: idProp, cotizacion: inicial }: DetalleCotizacionProps) {
  const t = useTranslations('finanzasDocumentosR3.cotizaciones');
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const mensajeError = useMensajeErrorCotizacion();
  const id = idProp ?? inicial?.id ?? '';

  const [cot, setCot] = useState<CotizacionDetalle | null>(inicial ?? null);
  const [cargando, setCargando] = useState(!inicial);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<AccionCotizacion | null>(null);
  const [enviarAbierto, setEnviarAbierto] = useState(false);
  const [convertirAbierto, setConvertirAbierto] = useState(false);
  const [confirmar, setConfirmar] = useState<'eliminar' | 'rechazar' | null>(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      setCot(await CotizacionesService.detalle(id));
    } catch (e) {
      setErrorCarga(e instanceof ErrorPeticionCotizacion ? e.codigo : 'error_desconocido');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    if (!inicial) void cargar();
  }, [cargar, inicial]);

  // Fechas: `issue_date`/`valid_until` son `date` (sin zona); el historial, timestamptz en la zona de la sucursal.
  const { formatPlain, formatDateTime, getToday } = useFormatDate(cot?.branch_id ?? null);
  const hoy = getToday();
  const ctxMoneda = moneda.paraDocumento(cot?.currency);

  if (errorCarga === 'cotizacion_no_encontrada') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante="empty"
          icono={FileText}
          titulo={t('detalle.noEncontrada')}
          descripcion={t('detalle.noEncontradaDescripcion')}
          accion={{ etiqueta: t('detalle.volverListado'), href: RUTA_COTIZACIONES }}
        />
      </div>
    );
  }
  if (errorCarga === 'sin_permiso') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="forbidden" titulo={t('listado.sinPermiso')} descripcion={t('listado.sinPermisoDescripcion')} />
      </div>
    );
  }
  if (errorCarga) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="error" titulo={t('detalle.errorCarga')} onReintentar={() => void cargar()} />
      </div>
    );
  }

  const numero = cot?.number ?? '';
  const estado = cot?.status ?? 'draft';
  const diasVigencia = cot?.valid_until ? diasEntre(hoy, cot.valid_until) : null;
  const vigencia = vigenciaDe({ estado, dias_vigencia: diasVigencia });
  const reglas = cot
    ? accionesCotizacion({ estado, estado_guardado: cot.stored_status, factura_id: cot.converted_invoice_id }, { escribir: permisos.crear, convertir: permisos.crear })
    : { primaria: null, secundarias: [], menu: [] };

  // ── Acciones ──────────────────────────────────────────────────────────
  const ejecutar = async (accion: AccionCotizacion, fn: () => Promise<void>) => {
    setOcupado(accion);
    try {
      await fn();
    } catch (e) {
      toastError(mensajeError(e));
    } finally {
      setOcupado(null);
    }
  };

  const cambiarEstado = (estadoNuevo: 'sent' | 'accepted' | 'rejected') =>
    ejecutar(estadoNuevo === 'accepted' ? 'aceptar' : estadoNuevo === 'sent' ? 'marcar_enviada' : 'rechazar', async () => {
      await CotizacionesService.changeStatus(id, estadoNuevo);
      toastSuccess(t(estadoNuevo === 'accepted' ? 'estado.aceptada' : estadoNuevo === 'sent' ? 'estado.enviada' : 'estado.rechazada', { numero }));
      setConfirmar(null);
      await cargar();
    });

  const duplicar = (accion: 'duplicar' | 'renovar') =>
    ejecutar(accion, async () => {
      const nueva = await CotizacionesService.duplicateQuotation(id);
      toastSuccess(t('acciones.duplicada', { numero: nueva.number }));
      router.push(`${RUTA_COTIZACIONES}/${nueva.id}`);
    });

  const eliminar = () =>
    ejecutar('eliminar', async () => {
      await CotizacionesService.deleteQuotation(id);
      toastSuccess(t('eliminar.hecho', { numero }));
      router.push(RUTA_COTIZACIONES);
    });

  const al: Record<AccionCotizacion, () => void> = {
    enviar: () => setEnviarAbierto(true),
    reenviar: () => setEnviarAbierto(true),
    marcar_enviada: () => void cambiarEstado('sent'),
    convertir: () => setConvertirAbierto(true),
    ver_factura: () => cot?.converted_invoice_id && router.push(`${RUTA_FACTURA}/${cot.converted_invoice_id}`),
    duplicar: () => void duplicar('duplicar'),
    renovar: () => void duplicar('renovar'),
    editar: () => router.push(`${RUTA_COTIZACIONES}/${id}/editar`),
    aceptar: () => void cambiarEstado('accepted'),
    rechazar: () => setConfirmar('rechazar'),
    eliminar: () => setConfirmar('eliminar'),
    pdf: () => abrirDocumento('cotizacion', id),
    imprimir: () => imprimirDocumento('cotizacion', id),
  };
  const iconos: Record<AccionCotizacion, typeof Send> = {
    enviar: Send,
    reenviar: Send,
    marcar_enviada: MailCheck,
    convertir: FileCheck2,
    ver_factura: FileText,
    duplicar: Copy,
    renovar: Copy,
    editar: Pencil,
    aceptar: Check,
    rechazar: XCircle,
    eliminar: Trash2,
    pdf: Download,
    imprimir: Printer,
  };
  const texto = (a: AccionCotizacion) => t(`detalle.acciones.${a}`);

  const menu: AccionFila[] = reglas.menu.map((a, i) => ({
    id: a,
    etiqueta: texto(a),
    icono: iconos[a],
    onSelect: al[a],
    destructiva: a === 'eliminar',
    separadorAntes: (a === 'rechazar' || a === 'eliminar') && i > 0 && reglas.menu[i - 1] !== 'rechazar',
    deshabilitada: ocupado !== null,
  }));

  const boton = (a: AccionCotizacion, variante: 'primario' | 'secundario') => {
    const Icono = iconos[a];
    return (
      <button key={a} type="button" onClick={al[a]} disabled={ocupado !== null} className={clasesBoton({ variante })}>
        <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {ocupado === a ? t('detalle.procesando') : texto(a)}
      </button>
    );
  };

  const acciones = cot ? (
    <div className="flex flex-wrap items-center gap-2">
      {reglas.secundarias.map((a) => boton(a, 'secundario'))}
      {reglas.primaria && boton(reglas.primaria, 'primario')}
      {menu.length > 0 && <RowActionsMenu acciones={menu} titulo={numero} orientacion="horizontal" tamano="md" />}
    </div>
  ) : null;

  // ── Cuerpo ────────────────────────────────────────────────────────────
  const items = cot?.quotation_items ?? [];
  const lineas: LineaDocumento[] = items.map((l) => ({
    id: l.id,
    descripcion: l.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    cantidad: l.qty,
    precioUnitario: l.unit_price,
    descuento: l.discount_amount || null,
    impuestos: l.tax_rate > 0 ? [{ nombre: nombreImpuesto(l.tax_code) ?? t('detalle.impuesto'), tarifa: l.tax_rate, incluido: l.tax_included }] : [],
    total: l.total_line,
  }));
  const impuestos = impuestosPorTarifa(items).map((i) => ({ nombre: nombreImpuesto(i.codigo) ?? t('detalle.impuesto'), tarifa: i.tarifa, base: i.base, importe: i.importe }));
  const descuento = cot?.discount_total ?? 0;

  const textoVigencia = (): { texto: string; tono?: 'peligro' | 'advertencia' } => {
    if (!cot?.valid_until) return { texto: '—' };
    const f = formatPlain(cot.valid_until);
    if (vigencia.tipo === 'vencio') return { texto: t('detalle.vigenciaVencio', { fecha: f, dias: vigencia.dias }), tono: 'peligro' };
    if (vigencia.tipo === 'vence_hoy') return { texto: t('detalle.vigenciaHoy', { fecha: f }), tono: 'advertencia' };
    if (vigencia.tipo === 'vence_pronto') return { texto: t('detalle.vigenciaVenceEn', { fecha: f, dias: vigencia.dias }), tono: 'advertencia' };
    return { texto: f };
  };
  const tv = textoVigencia();

  const cliente = cot?.customers;
  const docCliente = cliente?.identification_number ? `${(cliente.identification_type ?? '').toUpperCase()} ${cliente.identification_number}`.trim() : null;

  const eslabones: EslabonDocumento[] = [];
  if (cot?.opportunity_id) {
    eslabones.push({
      id: `op-${cot.opportunity_id}`,
      tipo: 'pedido',
      etiquetaTipo: t('detalle.cadena.oportunidad'),
      numero: cot.opportunity_name ?? t('detalle.cadena.oportunidad'),
      href: `/app/crm/oportunidades/${cot.opportunity_id}`,
    });
  }
  if (cot) {
    eslabones.push({ id: cot.id, tipo: 'cotizacion', numero, estado: estadoBadgeCotizacion(estado), actual: true });
    if (cot.converted_invoice_id) {
      eslabones.push({ id: cot.converted_invoice_id, tipo: 'factura', numero: cot.converted_invoice_number ?? t('detalle.cadena.factura'), href: `${RUTA_FACTURA}/${cot.converted_invoice_id}` });
    } else {
      eslabones.push({
        id: 'factura-pendiente',
        tipo: 'factura',
        numero: '—',
        pendiente: true,
        fecha: estado === 'expired' ? t('detalle.cadena.noSeConvierte') : estado === 'rejected' ? t('detalle.cadena.rechazada') : t('detalle.cadena.alConvertir'),
      });
    }
  }

  const subtitulo = cot
    ? [cliente?.full_name ?? t('detalle.sinCliente'), cot.valid_until ? (estado === 'expired' ? t('detalle.vencioEl', { fecha: formatPlain(cot.valid_until) }) : t('detalle.validaHasta', { fecha: formatPlain(cot.valid_until) })) : null]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <DocumentoCabecera
        tipo="cotizacion"
        titulo={cot ? t('detalle.titulo', { numero }) : t('detalle.cargando')}
        subtitulo={subtitulo}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo'), href: RUTA_COTIZACIONES }, { etiqueta: numero }]}
        volverA={RUTA_COTIZACIONES}
        insignias={cot ? <StatusBadge estado={estadoBadgeCotizacion(estado)} etiqueta={t(`estados.${estado}`)} tamano="md" /> : null}
        acciones={acciones}
        cargando={cargando && !cot}
      />

      {cot && estado === 'expired' && (
        <AvisoTonal
          tono="advertencia"
          icono={TriangleAlert}
          titulo={t('detalle.avisoVencida.titulo', { fecha: cot.valid_until ? formatPlain(cot.valid_until) : '' })}
          descripcion={t('detalle.avisoVencida.descripcion')}
          accion={permisos.crear ? { etiqueta: t('detalle.acciones.duplicar'), onClick: () => void duplicar('renovar'), cargando: ocupado === 'renovar' } : undefined}
        />
      )}
      {cot && estado === 'converted' && cot.converted_invoice_id && (
        <AvisoTonal
          tono="informacion"
          titulo={t('detalle.avisoConvertida.titulo', { numero: cot.converted_invoice_number ?? '' })}
          descripcion={t('detalle.avisoConvertida.descripcion')}
          accion={{ etiqueta: t('detalle.acciones.ver_factura'), href: `${RUTA_FACTURA}/${cot.converted_invoice_id}` }}
        />
      )}

      {cot && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
            <Tarjeta titulo={t('detalle.clienteCondiciones')}>
              <ListaDatos>
                <FilaDato
                  etiqueta={t('detalle.cliente')}
                  valor={
                    cliente ? (
                      <Link href={`/app/clientes/${cliente.id}`} className="text-link hover:underline">
                        {[cliente.full_name, docCliente].filter(Boolean).join(' · ')}
                      </Link>
                    ) : (
                      t('detalle.sinCliente')
                    )
                  }
                />
                <FilaDato etiqueta={t('detalle.emision')} valor={formatPlain(cot.issue_date)} />
                <FilaDato etiqueta={t('detalle.validaHastaEtiqueta')} valor={tv.texto} tono={tv.tono} />
                <FilaDato etiqueta={t('detalle.plazo')} valor={cot.payment_terms ? t('detalle.dias', { dias: cot.payment_terms }) : t('detalle.contado')} />
                {cot.branch_name && <FilaDato etiqueta={t('detalle.sucursal')} valor={cot.branch_name} />}
                {cot.salesperson_name && <FilaDato etiqueta={t('detalle.vendedor')} valor={cot.salesperson_name} />}
                <FilaDato etiqueta={t('detalle.moneda')} valor={ctxMoneda.code} />
              </ListaDatos>
            </Tarjeta>

            <DocumentoLineas lineas={lineas} modo="lectura" moneda={ctxMoneda} etiqueta={t('detalle.lineas')} estado={cargando ? 'cargando' : 'listo'} />

            <DocumentoTotales
              variante="cotizacion"
              moneda={ctxMoneda}
              subtotal={cot.subtotal + descuento}
              descuentos={descuento > 0 ? [{ etiqueta: t('detalle.descuentos'), importe: descuento }] : undefined}
              impuestos={impuestos}
              impuestosIncluidos={cot.tax_included}
              mostrarBases
              total={cot.total}
            />

            {cot.terms_conditions && (
              <Tarjeta titulo={t('detalle.terminos')}>
                <HtmlContentRenderer html={cot.terms_conditions} className="text-sm text-fg" />
              </Tarjeta>
            )}
            {cot.notes && (
              <Tarjeta titulo={t('detalle.notas')}>
                <HtmlContentRenderer html={cot.notes} className="text-sm text-fg" />
              </Tarjeta>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
            {(estado === 'sent' || estado === 'draft') && permisos.crear && (
              <Tarjeta titulo={t('detalle.respuesta.titulo')}>
                <p className="text-sm text-fg-secondary">{t('detalle.respuesta.descripcion')}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={ocupado !== null} onClick={() => void cambiarEstado('accepted')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                    <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {ocupado === 'aceptar' ? t('detalle.procesando') : t('detalle.acciones.aceptar')}
                  </button>
                  <button type="button" disabled={ocupado !== null} onClick={() => setConfirmar('rechazar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                    <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {t('detalle.respuesta.rechazar')}
                  </button>
                </div>
              </Tarjeta>
            )}

            <Tarjeta titulo={t('detalle.cadena.titulo')}>
              <CadenaDocumento eslabones={eslabones} ordenar={false} etiqueta={t('detalle.cadena.titulo')} />
            </Tarjeta>

            {cot.historial && cot.historial.length > 0 && (
              <Tarjeta titulo={t('detalle.historial.titulo')}>
                <ol className="flex flex-col gap-3">
                  {cot.historial.map((h, i) => (
                    <li key={`${h.tipo}-${h.fecha}-${i}`} className="flex flex-col">
                      <span className="text-sm text-fg">
                        {h.tipo === 'enviada'
                          ? t('detalle.historial.enviada', { destino: h.detalle ?? '' })
                          : h.tipo === 'vista'
                            ? t('detalle.historial.vista', { destino: h.detalle ?? '' })
                            : h.tipo === 'convertida'
                              ? t('detalle.historial.convertida', { numero: h.detalle ?? '' })
                              : cot.opportunity_name
                                ? t('detalle.historial.creadaDesde', { oportunidad: cot.opportunity_name })
                                : t('detalle.historial.creada')}
                      </span>
                      <span className="text-xs text-fg-muted">{formatDateTime(h.fecha)}</span>
                    </li>
                  ))}
                </ol>
              </Tarjeta>
            )}
          </div>
        </div>
      )}

      {cot && (
        <>
          <EnviarDocumentoDialog
            abierto={enviarAbierto}
            onAbiertoChange={setEnviarAbierto}
            endpoint={`/api/cotizaciones/${encodeURIComponent(id)}/enviar`}
            tipoClave="cotizacion"
            correo={cliente?.email ?? null}
            textos={{
              titulo: t('enviar.titulo', { numero }),
              descripcion: t('enviar.descripcion'),
              enviado: t('enviar.enviada'),
              enviadoA: (destino) => t('enviar.enviadaA', { destino }),
              enviadoSinAdjunto: (destino) => t('enviar.enviadaSinAdjunto', { destino }),
            }}
            mensajeError={(codigo, servidor) => mensajeError(new ErrorPeticionCotizacion(codigo, 0, servidor ?? codigo))}
            onEnviado={() => void cargar()}
          />
          {convertirAbierto && (
            <ConvertirCotizacionDialog
              abierto={convertirAbierto}
              onAbiertoChange={setConvertirAbierto}
              cotizacionId={id}
              cotizacion={cot}
              onConvertida={(r) => router.push(`${RUTA_FACTURA}/${r.invoiceId}`)}
            />
          )}
          <Dialogo
            abierto={confirmar === 'eliminar'}
            onAbiertoChange={(v) => !v && ocupado === null && setConfirmar(null)}
            titulo={t('eliminar.titulo', { numero })}
            descripcion={t('eliminar.descripcion')}
            ancho={440}
            primario={{ etiqueta: t('eliminar.confirmar'), onClick: () => void eliminar(), destructiva: true, cargando: ocupado === 'eliminar' }}
          />
          <Dialogo
            abierto={confirmar === 'rechazar'}
            onAbiertoChange={(v) => !v && ocupado === null && setConfirmar(null)}
            titulo={t('rechazar.titulo', { numero })}
            descripcion={t('rechazar.descripcion')}
            ancho={440}
            primario={{ etiqueta: t('rechazar.confirmar'), onClick: () => void cambiarEstado('rejected'), destructiva: true, cargando: ocupado === 'rechazar' }}
          />
        </>
      )}
    </div>
  );
}
