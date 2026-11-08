'use client';

/**
 * Un asiento que no entró al mayor (Figma «Escritorio / Configuración — falta cuenta de
 * redondeo»): el documento, lo que se habría publicado y lo que falta. Sirve también
 * para una reversa detenida: se elige el auxiliar de cada línea en cuenta de título.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ListChecks } from 'lucide-react';
import { AvisoTonal, PageHeader, clasesBoton } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { esCuentaDeMovimiento } from '@/lib/finanzas/contabilidad/cuentaLinea';
import {
  MOTIVO_REDONDEO,
  MOTIVOS_REVERSA,
  auxiliaresPara,
  ladoDeLaDiferencia,
  leerAsientoPropuesto,
  lineasPorResolver,
} from '@/lib/finanzas/contabilidad/redondeoReversa';
import {
  ContabilidadService,
  mensajeErrorAsiento,
  type AsientoPendiente,
  type ChartAccount,
  type JournalEntry,
} from '../ContabilidadService';

// La bandeja es la primera pestaña de Salud contable (ronda 3, decisión 3).
const RUTA_PENDIENTES = '/app/finanzas/contabilidad/salud';
const RUTA_ASIENTOS = '/app/finanzas/contabilidad/asientos';
const RUTA_CONFIGURACION = '/app/finanzas/configuracion-contable';

export function AsientoPendientePage({ failureId }: { failureId: number }) {
  const t = useTranslations('redondeoReversa.pendiente');
  const router = useRouter();
  const { formatear } = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const [fallo, setFallo] = useState<AsientoPendiente | null>(null);
  const [original, setOriginal] = useState<JournalEntry | null>(null);
  const [plan, setPlan] = useState<ChartAccount[]>([]);
  const [cuentas, setCuentas] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const esReversa = (MOTIVOS_REVERSA as readonly string[]).includes(fallo?.reason ?? '');

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError(false);
      const fila = await ContabilidadService.obtenerAsientoPendiente(failureId);
      setFallo(fila);
      if (fila && (MOTIVOS_REVERSA as readonly string[]).includes(fila.reason)) {
        const entrada = Number(fila.source_id);
        const [asiento, cuentasPlan] = await Promise.all([
          ContabilidadService.obtenerAsiento(entrada),
          ContabilidadService.obtenerPlanCuentas(),
        ]);
        setOriginal(asiento);
        setPlan(cuentasPlan);
      }
    } catch (causa) {
      console.error('No se pudo leer el pendiente contable:', causa);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [failureId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const propuesto = useMemo(() => leerAsientoPropuesto(fallo?.asiento_propuesto), [fallo]);

  const titulos = useMemo(() => new Set(plan.filter((c) => c.es_movimiento === false).map((c) => c.account_code)), [plan]);
  const deMovimiento = useMemo(() => plan.filter((c) => esCuentaDeMovimiento(c, plan)), [plan]);
  const porResolver = useMemo(
    () => lineasPorResolver(original?.lines ?? [], (cuenta) => titulos.has(cuenta)),
    [original, titulos],
  );
  const completas = porResolver.length > 0 && porResolver.every((l) => cuentas[String(l.id)]);

  const reintentar = async () => {
    try {
      setEnviando(true);
      const r = await ContabilidadService.reintentarRedondeo(failureId);
      if (r.publicado && r.journalEntryId) {
        toastSuccess(t('publicado'));
        router.push(`${RUTA_ASIENTOS}/${r.journalEntryId}`);
        return;
      }
      toastError(r.detalle ?? t('sigue'));
      await cargar();
    } catch (causa) {
      toastError(mensajeErrorAsiento(causa instanceof Error ? causa : null));
    } finally {
      setEnviando(false);
    }
  };

  const publicarReversa = async () => {
    try {
      setEnviando(true);
      const contraAsiento = await ContabilidadService.resolverReversaPendiente(failureId, cuentas);
      if (contraAsiento) {
        toastSuccess(t('reversaPublicada', { id: contraAsiento }));
        router.push(`${RUTA_ASIENTOS}/${contraAsiento}`);
        return;
      }
      await cargar();
    } catch (causa) {
      toastError(mensajeErrorAsiento(causa instanceof Error ? causa : null));
    } finally {
      setEnviando(false);
    }
  };

  const migas = [
    { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
    { etiqueta: t('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
    { etiqueta: t('migas.pendientes'), href: RUTA_PENDIENTES },
  ];

  if (cargando) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !fallo) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader titulo={t('noDisponible')} icono={ListChecks} migas={migas} variante="detail" volverA={RUTA_PENDIENTES} />
        <AvisoTonal
          tono={error ? 'peligro' : 'neutro'}
          titulo={error ? t('errorTitulo') : t('noDisponible')}
          descripcion={error ? t('errorTexto') : undefined}
          accion={error ? { etiqueta: t('reintentarCarga'), onClick: cargar } : { etiqueta: t('volver'), href: RUTA_PENDIENTES }}
        />
      </div>
    );
  }

  if (fallo.resolved_at) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader titulo={propuesto?.memo ?? t('resueltoTitulo')} icono={ListChecks} migas={migas} variante="detail" volverA={RUTA_PENDIENTES} />
        <AvisoTonal
          tono="exito"
          titulo={t('resueltoTitulo')}
          descripcion={fallo.resolution ?? undefined}
          accion={fallo.resolved_entry_id
            ? { etiqueta: t('verAsiento'), href: `${RUTA_ASIENTOS}/${fallo.resolved_entry_id}` }
            : { etiqueta: t('volver'), href: RUTA_PENDIENTES }}
        />
      </div>
    );
  }

  if (esReversa) {
    const lineas = original?.lines ?? [];
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader
          titulo={t('reversaTitulo', { id: fallo.source_id ?? '' })}
          subtitulo={t('estado')}
          icono={ListChecks}
          migas={migas}
          variante="detail"
          volverA={RUTA_PENDIENTES}
          movil={{ accionesEnFila: true }}
          acciones={
            <Link href={`${RUTA_ASIENTOS}/${fallo.source_id}`} className={clasesBoton({ variante: 'secundario' })}>
              {t('verOriginal')}
            </Link>
          }
        />
        <AvisoTonal
          tono="advertencia"
          titulo={fallo.reason === 'linea_sin_cuenta' ? t('sinCuentaTitulo') : t('tituloAvisoTitulo')}
          descripcion={t('tituloAvisoTexto')}
        />
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columnas.cuenta')}</TableHead>
                <TableHead>{t('columnas.descripcion')}</TableHead>
                <TableHead className="text-right">{t('columnas.debito')}</TableHead>
                <TableHead className="text-right">{t('columnas.credito')}</TableHead>
                <TableHead>{t('columnas.auxiliar')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((linea) => {
                const pendiente = porResolver.some((l) => l.id === linea.id);
                const id = `auxiliar-${linea.id}`;
                return (
                  <TableRow key={linea.id} className={pendiente ? 'bg-warning-subtle' : undefined}>
                    <TableCell className="text-sm text-fg">
                      {linea.account_code}
                      {linea.account?.name ? ` ${linea.account.name}` : ''}
                    </TableCell>
                    <TableCell className="text-sm text-fg-secondary">{linea.description ?? ''}</TableCell>
                    {/* Lo que publicará la reversa: débito y crédito invertidos. */}
                    <TableCell className="text-right text-sm tabular-nums text-fg">{linea.credit > 0 ? formatear(linea.credit) : ''}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-fg">{linea.debit > 0 ? formatear(linea.debit) : ''}</TableCell>
                    <TableCell className="min-w-56">
                      {pendiente && (
                        <>
                          <label htmlFor={id} className="sr-only">{t('columnas.auxiliar')}</label>
                          <select
                            id={id}
                            value={cuentas[String(linea.id)] ?? ''}
                            onChange={(e) => setCuentas((actual) => ({ ...actual, [String(linea.id)]: e.target.value }))}
                            className="h-10 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg"
                          >
                            <option value="">{t('elegirAuxiliar')}</option>
                            {auxiliaresPara(linea.account_code, deMovimiento).map((c) => (
                              <option key={c.account_code} value={c.account_code}>
                                {c.account_code} {c.name}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href={`/app/finanzas/contabilidad/plan-cuentas`} className={clasesBoton({ variante: 'secundario' })}>
            {t('crearAuxiliar')}
          </Link>
          <button
            type="button"
            onClick={publicarReversa}
            disabled={!completas || enviando}
            className={clasesBoton({ variante: 'primario' })}
          >
            {t('publicarReversa')}
          </button>
        </div>
      </div>
    );
  }

  if (fallo.reason !== MOTIVO_REDONDEO || !propuesto) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <PageHeader titulo={t('noDisponible')} icono={ListChecks} migas={migas} variante="detail" volverA={RUTA_PENDIENTES} />
        <AvisoTonal tono="advertencia" titulo={t('noDisponible')} descripcion={fallo.detail ?? undefined} accion={{ etiqueta: t('volver'), href: RUTA_PENDIENTES }} />
      </div>
    );
  }

  const lado = ladoDeLaDiferencia(propuesto.clave);
  const diferencia = formatear(propuesto.diferencia);

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={propuesto.memo ?? t('sinNombre')}
        subtitulo={propuesto.fecha ? `${t('estado')} · ${formatDate(propuesto.fecha)}` : t('estado')}
        icono={ListChecks}
        migas={migas}
        variante="detail"
        volverA={RUTA_PENDIENTES}
        movil={{ accionesEnFila: true }}
        acciones={
          <>
            <button type="button" onClick={reintentar} disabled={enviando} className={clasesBoton({ variante: 'secundario' })}>
              {t('reintentar')}
            </button>
            <Link href={RUTA_CONFIGURACION} className={clasesBoton({ variante: 'secundario' })}>
              {t('configurarCuenta')}
            </Link>
          </>
        }
      />
      <AvisoTonal
        tono="advertencia"
        rol="alert"
        titulo={propuesto.clave === 'redondeo' ? t('faltaFavor') : t('faltaContra')}
        descripcion={t('faltaTexto', { valor: diferencia })}
        accion={{ etiqueta: t('configurar'), href: RUTA_CONFIGURACION }}
      />
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columnas.cuenta')}</TableHead>
              <TableHead>{t('columnas.descripcion')}</TableHead>
              <TableHead className="text-right">{t('columnas.debito')}</TableHead>
              <TableHead className="text-right">{t('columnas.credito')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {propuesto.lineas.map((linea, i) => (
              <TableRow key={`${linea.cuenta}-${i}`}>
                <TableCell className="text-sm text-fg">{linea.cuenta}</TableCell>
                <TableCell className="text-sm text-fg-secondary">{linea.descripcion ?? ''}</TableCell>
                <TableCell className="text-right text-sm tabular-nums text-fg">{linea.debito > 0 ? formatear(linea.debito) : ''}</TableCell>
                <TableCell className="text-right text-sm tabular-nums text-fg">{linea.credito > 0 ? formatear(linea.credito) : ''}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-warning-subtle">
              <TableCell className="text-sm font-medium text-fg">{t('diferencia')}</TableCell>
              <TableCell className="text-sm text-fg-secondary">{t('sinCuenta')}</TableCell>
              <TableCell className="text-right text-sm font-medium tabular-nums text-fg">{lado === 'debito' ? diferencia : ''}</TableCell>
              <TableCell className="text-right text-sm font-medium tabular-nums text-fg">{lado === 'credito' ? diferencia : ''}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
