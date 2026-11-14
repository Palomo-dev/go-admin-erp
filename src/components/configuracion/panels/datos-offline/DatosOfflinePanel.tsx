'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, CloudOff, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOfflineData } from '@/lib/offline/useOfflineData';
import { useDesktopCatalog } from '@/lib/offline/useDesktopCatalog';
import { REPLICATION_MANIFEST, WINDOW_MONTHS, type TableManifest } from '@/lib/offline/replicationManifest';
import type { OfflineTableMeta } from '@/lib/offline/offlineDb';

const GROUP_ORDER: TableManifest['group'][] = ['inventario', 'ventas', 'finanzas', 'compras', 'clientes', 'organizacion', 'catalogos'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Configuración → Datos sin conexión (Go Admin Desktop, fase 4C).
 *
 * Tabla por entidad replicada (filas, última replicación, error), tamaño
 * estimado, «Sincronizar ahora» (catálogo del POS + réplica genérica) y
 * «Replicación completa» (fuerza la pasada con poda). Fuera del Desktop
 * explica que la función es del escritorio: la pestaña solo se registra
 * allí (`desktopOnly` en el registro de módulos).
 */
export function DatosOfflinePanel() {
  const t = useTranslations('configuracionTextos.datosOfflinePanel');
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const offline = useOfflineData(organizationId);
  const catalog = useDesktopCatalog(organizationId);
  const { formatDateTime, formatTime, getToday, toDate } = useFormatDate();

  const when = (ms: number | null | undefined) => {
    if (!ms) return '—';
    const d = new Date(ms);
    return toDate(d) === getToday() ? formatTime(d) : formatDateTime(d);
  };

  /** Nombre visible de la entidad: traducción por tabla; si falta, la etiqueta del manifiesto. */
  const entityLabel = (m: TableManifest) =>
    t.has(`entidades.${m.table}`) ? t(`entidades.${m.table}`) : m.label;

  const rows = useMemo(() => {
    const byGroup = new Map<TableManifest['group'], TableManifest[]>();
    for (const m of REPLICATION_MANIFEST) {
      const list = byGroup.get(m.group) ?? [];
      list.push(m);
      byGroup.set(m.group, list);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, tables: byGroup.get(g)! }));
  }, []);

  if (!offline.isDesktop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CloudOff className="h-5 w-5" aria-hidden="true" /> {t('titulo')}</CardTitle>
          <CardDescription>{t('soloDesktop')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const status = offline.status;
  const tablesWithError = status ? Object.values(status.tables).filter((t) => t.error).length : 0;
  const tablesReplicated = status ? Object.values(status.tables).filter((t) => t.replicated_at > 0).length : 0;
  const busy = offline.replicating || catalog.replicating;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5" aria-hidden="true" /> {t('titulo')}</CardTitle>
          <CardDescription>{t('descripcion', { meses: WINDOW_MONTHS })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t('resumen.estado')}</dt>
              <dd className="font-medium">{offline.isOnline ? t('resumen.conConexion') : t('resumen.sinConexion')}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t('resumen.ultimaReplicacion')}</dt>
              <dd className="font-medium">{when(status?.latestAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t('resumen.filasLocales')}</dt>
              <dd className="font-medium">
                {t('resumen.filasValor', {
                  filas: status ? status.totalRows.toLocaleString('es-CO') : '—',
                  replicadas: tablesReplicated,
                  total: REPLICATION_MANIFEST.length,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t('resumen.tamano')}</dt>
              <dd className="font-medium">{status ? formatBytes(status.estimatedBytes) : '—'}</dd>
            </div>
          </dl>
          {catalog.status && !catalog.status.isEmpty && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('catalogoPos', {
                productos: catalog.status.productsCount,
                clientes: catalog.status.customersCount,
                fecha: when(catalog.status.replicatedAt),
              })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => offline.syncNow()} disabled={busy || !offline.isOnline}>
              <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
              {busy ? t('acciones.sincronizando') : t('acciones.sincronizar')}
            </Button>
            <Button type="button" variant="outline" onClick={() => offline.syncNow({ full: true })} disabled={busy || !offline.isOnline}>
              {t('acciones.replicacionCompleta')}
            </Button>
            {!offline.isOnline && <span className="text-xs text-amber-700 dark:text-amber-300">{t('sinRed')}</span>}
            {offline.error && <span className="text-xs text-red-600 dark:text-red-400" role="alert">{offline.error}</span>}
            {tablesWithError > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {t('tablasConAviso', { n: tablesWithError })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {rows.map(({ group, tables }) => (
        <Card key={group}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t(`grupos.${group}`)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columnas.entidad')}</TableHead>
                  <TableHead className="text-right">{t('columnas.filas')}</TableHead>
                  <TableHead>{t('columnas.ultimaReplicacion')}</TableHead>
                  <TableHead>{t('columnas.ventanaTope')}</TableHead>
                  <TableHead>{t('columnas.estado')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((m) => {
                  const meta: OfflineTableMeta | undefined = status?.tables[m.table];
                  const replicated = !!meta && meta.replicated_at > 0;
                  return (
                    <TableRow key={m.table}>
                      <TableCell>
                        <div className="font-medium">{entityLabel(m)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{m.table}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{replicated ? meta!.count.toLocaleString('es-CO') : '—'}</TableCell>
                      <TableCell>{replicated ? when(meta!.replicated_at) : t('estado.nunca')}</TableCell>
                      <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                        {m.window
                          ? t('ventanaYTope', { meses: m.window.months, max: m.maxRows.toLocaleString('es-CO') })
                          : t('tope', { max: m.maxRows.toLocaleString('es-CO') })}
                      </TableCell>
                      <TableCell>
                        {meta?.error ? (
                          <span className="inline-flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300" title={meta.error}>
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="line-clamp-2">{meta.error}</span>
                          </span>
                        ) : replicated ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {t('estado.alDia')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">{t('estado.pendiente')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
