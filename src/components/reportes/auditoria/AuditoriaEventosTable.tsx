'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { FileText } from 'lucide-react';
import type { EventoAuditoria } from './auditoriaReportService';

interface AuditoriaEventosTableProps {
  data: EventoAuditoria[];
  isLoading: boolean;
}

const actionLabels: Record<string, { label: string; class: string }> = {
  create: { label: 'Crear', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  insert: { label: 'Crear', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  update: { label: 'Actualizar', class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  edit: { label: 'Editar', class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  delete: { label: 'Eliminar', class: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  remove: { label: 'Eliminar', class: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
};

function getActionBadge(action: string): { label: string; class: string } {
  const lower = action.toLowerCase();
  for (const [key, val] of Object.entries(actionLabels)) {
    if (lower.includes(key)) return val;
  }
  return { label: action, class: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' };
}

export function AuditoriaEventosTable({ data, isLoading }: AuditoriaEventosTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Eventos Recientes</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {data.length} registros
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay eventos para los filtros seleccionados</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Fecha</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Usuario</th>
                <th className="text-center py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">Acción</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Entidad</th>
                <th className="text-left py-2.5 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">ID Entidad</th>
                <th className="text-left py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => {
                const badge = getActionBadge(e.action);
                return (
                  <tr key={e.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="py-2.5 pr-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 pr-3 text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[120px]">{e.user_name}</td>
                    <td className="py-2.5 pr-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.class}`}>{badge.label}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{e.entity_type}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-400 dark:text-gray-500 hidden lg:table-cell font-mono truncate max-w-[100px]">{e.entity_id}</td>
                    <td className="py-2.5 text-xs text-gray-400 dark:text-gray-500 hidden sm:table-cell">{e.ip_address || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
