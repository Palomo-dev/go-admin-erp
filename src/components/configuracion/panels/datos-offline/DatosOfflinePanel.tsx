'use client';

import { useMemo } from 'react';
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

const GROUP_LABELS: Record<TableManifest['group'], string> = {
  organizacion: 'Organización',
  catalogos: 'Catálogos',
  inventario: 'Inventario',
  clientes: 'Clientes',
  ventas: 'Ventas',
  compras: 'Compras',
  finanzas: 'Finanzas',
};

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
          <CardTitle className="flex items-center gap-2"><CloudOff className="h-5 w-5" aria-hidden="true" /> Datos sin conexión</CardTitle>
          <CardDescription>Esta función es de Go Admin Desktop. Desde el navegador la aplicación siempre necesita internet.</CardDescription>
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
          <CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5" aria-hidden="true" /> Datos sin conexión</CardTitle>
          <CardDescription>
            Copia local de los datos de la organización para leer inventario, ventas, finanzas, compras y clientes sin internet. Con red se actualiza al
            iniciar y cada 10 minutos; las tablas transaccionales guardan los últimos {WINDOW_MONTHS} meses. Las escrituras sin red siguen las reglas de
            cada módulo (el POS usa su bandeja de ventas pendientes).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Estado</dt>
              <dd className="font-medium">{offline.isOnline ? 'Con conexión' : 'Sin conexión (leyendo datos locales)'}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Última replicación</dt>
              <dd className="font-medium">{when(status?.latestAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Filas locales</dt>
              <dd className="font-medium">{status ? status.totalRows.toLocaleString('es-CO') : '—'} en {tablesReplicated}/{REPLICATION_MANIFEST.length} tablas</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Tamaño estimado</dt>
              <dd className="font-medium">{status ? formatBytes(status.estimatedBytes) : '—'}</dd>
            </div>
          </dl>
          {catalog.status && !catalog.status.isEmpty && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Catálogo del POS: {catalog.status.productsCount} productos · {catalog.status.customersCount} clientes · actualizado {when(catalog.status.replicatedAt)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => offline.syncNow()} disabled={busy || !offline.isOnline}>
              <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
              {busy ? 'Sincronizando…' : 'Sincronizar ahora'}
            </Button>
            <Button type="button" variant="outline" onClick={() => offline.syncNow({ full: true })} disabled={busy || !offline.isOnline}>
              Replicación completa
            </Button>
            {!offline.isOnline && <span className="text-xs text-amber-700 dark:text-amber-300">Sin conexión: se actualizará al volver la red.</span>}
            {offline.error && <span className="text-xs text-red-600 dark:text-red-400" role="alert">{offline.error}</span>}
            {tablesWithError > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {tablesWithError} {tablesWithError === 1 ? 'tabla con aviso' : 'tablas con aviso'}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {rows.map(({ group, tables }) => (
        <Card key={group}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{GROUP_LABELS[group]}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entidad</TableHead>
                  <TableHead className="text-right">Filas</TableHead>
                  <TableHead>Última replicación</TableHead>
                  <TableHead>Ventana / tope</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((m) => {
                  const meta: OfflineTableMeta | undefined = status?.tables[m.table];
                  const replicated = !!meta && meta.replicated_at > 0;
                  return (
                    <TableRow key={m.table}>
                      <TableCell>
                        <div className="font-medium">{m.label}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{m.table}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{replicated ? meta!.count.toLocaleString('es-CO') : '—'}</TableCell>
                      <TableCell>{replicated ? when(meta!.replicated_at) : 'Nunca'}</TableCell>
                      <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                        {m.window ? `${m.window.months} meses · ` : ''}máx. {m.maxRows.toLocaleString('es-CO')}
                      </TableCell>
                      <TableCell>
                        {meta?.error ? (
                          <span className="inline-flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300" title={meta.error}>
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="line-clamp-2">{meta.error}</span>
                          </span>
                        ) : replicated ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Al día
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">Pendiente</span>
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
