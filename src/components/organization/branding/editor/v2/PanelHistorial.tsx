'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { OrganizationTimezoneProvider, useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { clienteSitiosV2, ErrorApiSitio } from '@/lib/website/v2/clienteSitiosV2';
import type { RevisionResumen } from '@/lib/website/v2/tipos';
import { useTranslations } from 'next-intl';

interface PanelHistorialProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  sitioId: string;
  branchId: number | null;
  /** Hay cambios en el editor sin guardar: restaurar los reemplazaría. */
  hayCambiosLocales: boolean;
  borradorActualizadoEn: string | null;
  onRestaurar: (revision: RevisionResumen) => Promise<void>;
}

/**
 * Historial de versiones (Figma 05h). Restaurar copia la versión al borrador como versión
 * nueva; la revisión nunca se edita y lo que está en línea no cambia hasta publicar.
 */
/**
 * El editor vive fuera de `/app` (sin `OrganizationTimezoneProvider` en su layout): el panel trae
 * su propio proveedor para que las fechas salgan en la zona de la organización, no del fallback.
 */
export function PanelHistorial(props: PanelHistorialProps) {
  return (
    <OrganizationTimezoneProvider>
      <ContenidoHistorial {...props} />
    </OrganizationTimezoneProvider>
  );
}

function ContenidoHistorial({
  abierto,
  onAbiertoChange,
  sitioId,
  branchId,
  hayCambiosLocales,
  borradorActualizadoEn,
  onRestaurar,
}: PanelHistorialProps) {
  const t = useTranslations('branding.editor');
  const { formatDateTime } = useFormatDate(branchId);
  const [revisiones, setRevisiones] = useState<RevisionResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<RevisionResumen | null>(null);
  const [restaurando, setRestaurando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    setRevisiones(null);
    try {
      setRevisiones(await clienteSitiosV2.revisiones(sitioId));
    } catch (e) {
      setError(e instanceof ErrorApiSitio ? e.message : 'No se pudo cargar el historial.');
      setRevisiones([]);
    }
  }, [sitioId]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const confirmar = async () => {
    if (!pendiente) return;
    setRestaurando(true);
    try {
      await onRestaurar(pendiente);
      setPendiente(null);
      onAbiertoChange(false);
    } finally {
      setRestaurando(false);
    }
  };

  return (
    <>
      <HojaDetalle
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={t('panelHistorial.historialVersiones')}
        subtitulo={t('panelHistorial.versionesPublicadasEsteSitio')}
        ancho={480}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <p className="text-sm font-medium">{t('panelHistorial.borradorActual')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {borradorActualizadoEn ? t('panelHistorial.guardado', { borradorActualizadoEn: formatDateTime(borradorActualizadoEn) }) : t('panelHistorial.sinGuardarTodavia')}
              {hayCambiosLocales ? t('panelHistorial.hayCambiosSinGuardar') : ''}
            </p>
          </div>

          {error ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {error}{' '}
              <button type="button" className="underline" onClick={() => void cargar()}>
                {t('panelHistorial.reintentar')}
              </button>
            </div>
          ) : null}

          {revisiones === null ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : revisiones.length === 0 && !error ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              <History className="h-6 w-6" aria-hidden />
              <p>{t('panelHistorial.todaviaNoHasPublicado')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {revisiones.map((r) => (
                <li key={r.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.nota ? `«${r.nota}»` : t('panelHistorial.version', { numero: r.numero })}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(r.publicadaEn)}
                        {r.autor ? ` · ${r.autor}` : ''} {t('panelHistorial.version2', { numero: r.numero })}
                      </p>
                    </div>
                    {r.enLinea ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                        {t('panelHistorial.publicada')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setPendiente(r)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      {t('panelHistorial.restaurarBorrador')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {restaurando ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t('panelHistorial.restaurando')} /> : null}
        </div>
      </HojaDetalle>

      <ConfirmDialog
        open={pendiente !== null}
        onOpenChange={(v) => {
          if (!v && !restaurando) setPendiente(null);
        }}
        title={pendiente ? t('panelHistorial.restaurarVersion', { numero: pendiente.numero }) : t('panelHistorial.restaurarVersion2')}
        description={hayCambiosLocales ? t('panelHistorial.restaurarDescripcionConLocales') : t('panelHistorial.restaurarDescripcion')}
        confirmLabel={t('panelHistorial.restaurarBorrador')}
        loading={restaurando}
        onConfirm={confirmar}
      />
    </>
  );
}
