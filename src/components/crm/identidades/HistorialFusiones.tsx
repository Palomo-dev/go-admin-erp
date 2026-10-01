'use client';
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { clasesBoton } from '@/components/kit/botonClases';
import type { FilaFusion } from './IdentidadesService';
import { fusionReversible } from './identidadesLogica';

export function HistorialFusiones({
  rows,
  canUndo,
  ocupado,
  onDeshacer,
}: {
  rows: FilaFusion[];
  canUndo: boolean;
  ocupado: boolean;
  onDeshacer: (id: string) => void;
}) {
  const t = useTranslations('crm.identidades');
  const { formatDateTime } = useFormatDate(null);
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">{t('historial')}</caption>
        <thead className="bg-subtle text-fg-secondary">
          <tr>
            {['fusion', 'movidos', 'quien', 'cuando', 'accion'].map((key) => (
              <th
                key={key}
                scope="col"
                className="p-4 text-left text-xs font-medium"
              >
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const expired = !fusionReversible(row.merged_at, row.undone_at);
            return (
              <tr key={row.id} className="border-t border-line">
                <td className="p-4 text-fg">
                  {row.secundario?.full_name ?? t('sinNombre')} →{' '}
                  {row.principal?.full_name ?? t('sinNombre')}
                </td>
                <td className="p-4 text-fg-secondary">
                  {row.moved_counts
                    .filter((c) => c.count > 0)
                    .map((c) => `${c.count} ${t(`tablas.${c.table}`)}`)
                    .join(' · ') || '—'}
                </td>
                <td className="p-4 text-fg-secondary">
                  {[row.autor?.first_name, row.autor?.last_name]
                    .filter(Boolean)
                    .join(' ') || '—'}
                </td>
                <td className="p-4 text-fg-secondary">
                  {formatDateTime(row.merged_at)}
                </td>
                <td className="p-4">
                  {row.undone_at ? (
                    <span className="text-xs text-fg-secondary">
                      {t('deshecha')}
                    </span>
                  ) : expired ? (
                    <span className="text-xs text-fg-secondary">
                      {t('expirada')}
                    </span>
                  ) : canUndo ? (
                    <button
                      className={clasesBoton({
                        variante: 'secundario',
                        tamano: 'sm',
                      })}
                      disabled={ocupado}
                      onClick={() => onDeshacer(row.id)}
                    >
                      {t('deshacer')}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
