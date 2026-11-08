'use client';

/**
 * Detalle de asiento (Contabilidad v2 §4.4). Figma: automático `985:66805`,
 * con descuadre `985:67647`, manual publicado `985:68446`, revertido
 * `985:69165`, contra-asiento `985:69884`, borrador `985:70600`, no encontrado
 * `985:71310`, compra con retenciones `1485:117655`; tableta `988:625268`;
 * móvil `989:75990` y `989:76241`.
 *
 * Acciones por tipo (`asientosLogica.accionesAsiento`):
 * - borrador: Publicar · Descartar (con confirmación) · Duplicar · Imprimir;
 * - manual publicado: Revertir (permiso «Revertir asientos»; sin él, deshabilitado
 *   con motivo) · Duplicar · Imprimir;
 * - automático: Imprimir e «Ir al documento». No se revierte aquí ni se duplica
 *   (duplicarlo repetía el hecho como asiento manual);
 * - contra-asiento: Ver original · Imprimir.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpen, Check, Copy, Printer, Trash2, Undo2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { AvisoTonal, ConfirmDialog, DocumentoCabecera, EmptyState, Skeleton, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { esTipoComprobante, NOMBRE_COMPROBANTE, textoComprobante } from '@/lib/finanzas/contabilidad/comprobante';
import { useFormatDateFor } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { reversaEsCopiaExacta } from '@/lib/finanzas/contabilidad/redondeoReversa';
import { accionesAsiento, tipoAsiento } from '@/lib/finanzas/contabilidad/asientosLogica';
import { documentoDeOrigen } from '@/lib/finanzas/contabilidad/origenAsiento';
import { EtiquetaOrigen, MarcaReversion, TablaContable, useNumeroAsiento, type LineaTablaContable } from '../piezas';
import { ContabilidadService, type JournalEntry, type EstadoReversion } from '../ContabilidadService';
import { OrigenCompraAsiento } from './OrigenCompraAsiento';
import { DatosAsiento } from './DatosAsiento';
import { RevertirAsientoDialog } from './RevertirAsientoDialog';

interface AsientoDetailPageProps {
  entryId: number;
}

type Carga = 'cargando' | 'listo' | 'noEncontrado';

export function AsientoDetailPage({ entryId }: AsientoDetailPageProps) {
  const t = useTranslations('finanzasContabilidadR3.detalle');
  const tc = useTranslations('finanzasContabilidadR3.comun');
  const tr = useTranslations('redondeoReversa.asiento');
  const tk = useTranslations('kit.documento.tipos');
  const router = useRouter();
  const numero = useNumeroAsiento();
  // Los importes contables se llevan en la moneda base de la organizacion.
  const { formatear } = useMonedaOrganizacion();
  const [asiento, setAsiento] = useState<JournalEntry | null>(null);
  const [carga, setCarga] = useState<Carga>('cargando');
  const [procesando, setProcesando] = useState(false);
  const [reversion, setReversion] = useState<EstadoReversion>({ revertidoPor: null, reversionDe: null });
  const [puedeRevertir, setPuedeRevertir] = useState(false);
  const [dialogoRevertir, setDialogoRevertir] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const { formatDate } = useFormatDateFor(asiento?.branch_id);
  const [centros, setCentros] = useState<Map<string, { code: string; name: string }>>(new Map());
  const [sede, setSede] = useState<string | null>(null);
  const [motivoReversa, setMotivoReversa] = useState<string | null>(null);
  const [copiaExacta, setCopiaExacta] = useState(true);

  const loadAsiento = useCallback(async () => {
    try {
      const data = await ContabilidadService.obtenerAsiento(entryId);
      if (!data) {
        setAsiento(null);
        setCarga('noEncontrado');
        return;
      }
      setAsiento(data);
      const idsCentros = [...new Set((data.lines ?? []).map((l) => l.cost_center_id).filter((id): id is string => !!id))];
      const [estadoReversion, nombresCentros] = await Promise.all([
        ContabilidadService.obtenerReversion(data),
        ContabilidadService.centrosDeCosto(idsCentros).catch(() => new Map<string, { code: string; name: string }>()),
      ]);
      setReversion(estadoReversion);
      setCentros(nombresCentros);
      if (data.source === 'reversal' && estadoReversion.reversionDe) {
        const [nombreSede, motivoTexto, asientoOriginal] = await Promise.all([
          ContabilidadService.nombreSucursal(data.branch_id).catch(() => null),
          ContabilidadService.motivoReversa(data.id).catch(() => null),
          ContabilidadService.obtenerAsiento(estadoReversion.reversionDe),
        ]);
        setSede(nombreSede);
        setMotivoReversa(motivoTexto);
        setCopiaExacta(!asientoOriginal?.lines || reversaEsCopiaExacta(asientoOriginal.lines, data.lines ?? []));
      }
      setCarga('listo');
    } catch (error) {
      console.error('Error cargando asiento:', error);
      toast.error(t('errorCargar'));
      setCarga('listo');
    }
  }, [entryId, t]);

  useEffect(() => {
    setCarga('cargando');
    void loadAsiento();
    ContabilidadService.puedeRevertir().then(setPuedeRevertir).catch(() => setPuedeRevertir(false));
  }, [loadAsiento]);

  const handlePublish = async () => {
    if (!asiento) return;
    setProcesando(true);
    try {
      await ContabilidadService.publicarAsiento(asiento.id);
      toast.success(t('toast.publicado'));
      await loadAsiento();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toast.errorPublicar'));
    } finally {
      setProcesando(false);
    }
  };

  const handleDuplicate = async () => {
    if (!asiento) return;
    setProcesando(true);
    try {
      const nuevo = await ContabilidadService.duplicarAsiento(asiento.id);
      toast.success(t('toast.duplicado'));
      router.push(`/app/finanzas/contabilidad/asientos/${nuevo.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toast.errorDuplicar'));
    } finally {
      setProcesando(false);
    }
  };

  const handleDelete = async () => {
    if (!asiento || asiento.posted) return;
    setProcesando(true);
    try {
      await ContabilidadService.eliminarAsiento(asiento.id);
      toast.success(t('toast.descartado'));
      router.push('/app/finanzas/contabilidad/asientos');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toast.errorDescartar'));
    } finally {
      setProcesando(false);
    }
  };

  const tituloReversa = asiento?.source === 'reversal' && reversion.reversionDe ? tr('reversaTitulo', { id: reversion.reversionDe }) : null;
  const comprobante = asiento ? textoComprobante(asiento.comprobante_prefijo, asiento.comprobante_numero) : null;
  const titulo = !asiento
    ? t('titulo')
    : tituloReversa ??
      (comprobante
        ? `${esTipoComprobante(asiento.comprobante_tipo) ? NOMBRE_COMPROBANTE[asiento.comprobante_tipo] : t('comprobante')} ${comprobante}`
        : t('tituloNumero', { numero: numero(asiento.id) }));

  if (carga === 'cargando') {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true">
        <DocumentoCabecera titulo={t('titulo')} cargando />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!asiento) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          variante="search"
          titulo={t('noEncontrado.titulo')}
          descripcion={t('noEncontrado.descripcion', { numero: numero(entryId) })}
          accion={{ etiqueta: t('noEncontrado.volver'), href: '/app/finanzas/contabilidad/asientos' }}
        />
      </div>
    );
  }

  const tipo = tipoAsiento(asiento);
  const acciones = accionesAsiento(asiento);
  const esContraAsiento = tipo === 'contraAsiento';
  const documento = tipo === 'automatico' ? documentoDeOrigen(asiento.source, asiento.source_id) : null;
  const monedaDe = (linea: { currency_code?: string | null }) => linea.currency_code ?? asiento.currency_code ?? null;
  const hayMoneda = esContraAsiento && !!asiento.lines?.some((l) => monedaDe(l));
  const haySede = esContraAsiento && !!sede;
  const hayRedondeo = !!asiento.lines?.some((l) => l.redondeo_traza);
  const motivoSinPermiso = !puedeRevertir ? t('acciones.sinPermisoRevertir') : undefined;

  const lineas: LineaTablaContable[] = (asiento.lines ?? []).map((line) => {
    const centro = line.cost_center_id ? centros.get(line.cost_center_id) : undefined;
    return {
      id: line.id,
      cuenta: line.account_code,
      nombreCuenta: line.account?.name ?? null,
      descripcion: line.redondeo_traza ? tr('lineaRedondeo') : line.description,
      tercero: line.tercero_nit ? `${line.tercero_nombre ? `${line.tercero_nombre} · ` : ''}${line.tercero_nit}` : null,
      centro: centro ? `${centro.code} · ${centro.name}` : null,
      debito: Number(line.debit) || 0,
      credito: Number(line.credit) || 0,
      resaltada: !!line.redondeo_traza,
      monedaLinea: monedaDe(line),
    } as LineaTablaContable & { monedaLinea: string | null };
  });

  const subtitulo = [asiento.memo || t('sinDescripcion'), formatDate(asiento.entry_date)].join(' · ');

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <DocumentoCabecera
        variante="detalle"
        tipo="asiento"
        icono={BookOpen}
        titulo={titulo}
        subtitulo={tituloReversa ? [asiento.posted ? tr('publicado', { fecha: formatDate(asiento.entry_date) }) : null, motivoReversa ? tr('motivo', { motivo: motivoReversa }) : null].filter(Boolean).join(' · ') : subtitulo}
        volverA="/app/finanzas/contabilidad/asientos"
        migas={[
          { etiqueta: tc('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migaLibro'), href: '/app/finanzas/contabilidad/asientos' },
          { etiqueta: titulo },
        ]}
        insignias={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge estado={asiento.posted ? 'publicado' : 'borrador'} etiqueta={asiento.posted ? t('estado.publicado') : t('estado.borrador')} />
            <EtiquetaOrigen source={asiento.source} />
            {reversion.revertidoPor && <MarcaReversion rol="revertido" numero={reversion.revertidoPor} />}
            {reversion.reversionDe && <MarcaReversion rol="contraAsiento" numero={reversion.reversionDe} />}
          </span>
        }
        accionesMovil={{
          principales: acciones.publicar ? (
            <button type="button" onClick={() => void handlePublish()} disabled={procesando} className={clasesBoton({ variante: 'primario' })}>
              <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.publicar')}
            </button>
          ) : undefined,
          menu: [
            { id: 'original', etiqueta: tr('verOriginal'), icono: BookOpen, onSelect: () => router.push(`/app/finanzas/contabilidad/asientos/${reversion.reversionDe}`), oculta: !reversion.reversionDe },
            { id: 'documento', etiqueta: documento ? t('acciones.irDocumento', { documento: tk(documento.tipo) }) : '', icono: ExternalLink, onSelect: () => documento?.href && router.push(documento.href), oculta: !documento?.href },
            { id: 'imprimir', etiqueta: t('acciones.imprimir'), icono: Printer, onSelect: () => router.push(`/app/finanzas/contabilidad/asientos/${asiento.id}/comprobante`) },
            { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => void handleDuplicate(), oculta: !acciones.duplicar, deshabilitada: procesando },
            { id: 'descartar', etiqueta: t('acciones.descartar'), icono: Trash2, onSelect: () => setConfirmarDescarte(true), oculta: !acciones.descartar, deshabilitada: procesando, destructiva: true },
            {
              id: 'revertir',
              etiqueta: t('acciones.revertir'),
              icono: Undo2,
              onSelect: () => setDialogoRevertir(true),
              oculta: !acciones.revertir,
              deshabilitada: procesando || !!motivoSinPermiso,
              motivo: motivoSinPermiso,
              destructiva: true,
            },
          ],
        }}
        acciones={
          <div className="flex flex-wrap gap-2">
            {reversion.reversionDe && (
              <Link href={`/app/finanzas/contabilidad/asientos/${reversion.reversionDe}`} className={clasesBoton({ variante: 'secundario' })}>
                {tr('verOriginal')}
              </Link>
            )}
            {documento?.href && (
              <Link href={documento.href} className={clasesBoton({ variante: 'secundario' })}>
                {t('acciones.irDocumento', { documento: tk(documento.tipo) })}
              </Link>
            )}
            <Link href={`/app/finanzas/contabilidad/asientos/${asiento.id}/comprobante`} className={clasesBoton({ variante: 'secundario' })}>
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.imprimir')}
            </Link>
            {acciones.duplicar && (
              <button type="button" onClick={() => void handleDuplicate()} disabled={procesando} className={clasesBoton({ variante: 'secundario' })}>
                <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.duplicar')}
              </button>
            )}
            {acciones.descartar && (
              <button type="button" onClick={() => setConfirmarDescarte(true)} disabled={procesando} className={clasesBoton({ variante: 'secundario' })}>
                <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.descartar')}
              </button>
            )}
            {acciones.publicar && (
              <button type="button" onClick={() => void handlePublish()} disabled={procesando} className={clasesBoton({ variante: 'primario' })}>
                <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.publicar')}
              </button>
            )}
            {acciones.revertir && (
              <button
                type="button"
                onClick={() => setDialogoRevertir(true)}
                disabled={procesando || !!motivoSinPermiso}
                title={motivoSinPermiso}
                aria-describedby={motivoSinPermiso ? 'motivo-revertir' : undefined}
                className={clasesBoton({ variante: 'destructivo' })}
              >
                <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.revertir')}
              </button>
            )}
            {motivoSinPermiso && acciones.revertir && (
              <span id="motivo-revertir" className="sr-only">
                {motivoSinPermiso}
              </span>
            )}
          </div>
        }
      />

      {asiento.source === 'invoice_purchase' && asiento.source_id && <OrigenCompraAsiento facturaId={asiento.source_id} />}

      {tipo === 'automatico' && !reversion.revertidoPor && asiento.source !== 'invoice_purchase' && (
        <AvisoTonal
          tono="informacion"
          titulo={t('automatico.titulo')}
          descripcion={documento ? t('automatico.conDocumento', { documento: tk(documento.tipo) }) : t('automatico.sinDocumento')}
        />
      )}

      {esContraAsiento && reversion.reversionDe && (
        <MarcaReversion
          rol="contraAsiento"
          variante="extendida"
          numero={reversion.reversionDe}
          fecha={asiento.posted ? formatDate(asiento.entry_date) : null}
          motivo={motivoReversa}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <Tarjeta titulo={t('lineas', { n: lineas.length })} className="lg:col-span-2" sinRelleno>
          <TablaContable
            lineas={lineas}
            formatear={(v) => formatear(v)}
            conDescripcion={!esContraAsiento}
            conTercero={lineas.some((l) => l.tercero)}
            conCentro={centros.size > 0}
            etiqueta={t('lineasEtiqueta')}
            columnasExtra={[
              ...(haySede ? [{ id: 'sede', encabezado: tr('sede'), valor: () => sede }] : []),
              ...(hayMoneda
                ? [{ id: 'moneda', encabezado: tr('moneda'), valor: (l: LineaTablaContable) => (l as LineaTablaContable & { monedaLinea: string | null }).monedaLinea }]
                : []),
            ]}
            className="rounded-none border-0"
          />
        </Tarjeta>
        <DatosAsiento asiento={asiento} />
      </div>

      {hayRedondeo && !esContraAsiento && <AvisoTonal tono="informacion" titulo={tr('cuadradoTitulo')} descripcion={tr('cuadradoTexto')} />}
      {esContraAsiento && reversion.reversionDe && (
        <AvisoTonal
          tono="informacion"
          titulo={copiaExacta ? tr('copiaTitulo') : tr('auxiliarTitulo')}
          descripcion={copiaExacta ? tr('copiaTexto') : tr('auxiliarTexto')}
        />
      )}

      {acciones.revertir && (
        <RevertirAsientoDialog
          asiento={asiento}
          abierto={dialogoRevertir}
          onAbiertoChange={setDialogoRevertir}
          puedeRevertir={puedeRevertir}
          revertidoPor={reversion.revertidoPor}
          onRevertido={() => void loadAsiento()}
        />
      )}

      <ConfirmDialog
        abierto={confirmarDescarte}
        onAbiertoChange={setConfirmarDescarte}
        titulo={t('descartar.titulo', { numero: numero(asiento.id) })}
        descripcion={t('descartar.descripcion')}
        textoConfirmar={t('descartar.confirmar')}
        tono="peligro"
        cargando={procesando}
        onConfirmar={handleDelete}
      />
    </div>
  );
}
