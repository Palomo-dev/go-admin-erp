'use client';

import React from 'react';
import Link from 'next/link';
import {
  GitMerge,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  RotateCcw,
  RefreshCcw,
  Clock,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IntegrationMapping } from '@/lib/services/integrationsService';
import { cn, formatDate } from '@/utils/Utils';

interface MapeosListProps {
  mappings: IntegrationMapping[];
  loading?: boolean;
  onEdit: (mapping: IntegrationMapping) => void;
  onDuplicate: (mapping: IntegrationMapping) => void;
  onRevalidate: (mapping: IntegrationMapping) => void;
  onDelete: (mapping: IntegrationMapping) => void;
  onRestore: (mapping: IntegrationMapping) => void;
}

export function MapeosList({
  mappings,
  loading = false,
  onEdit,
  onDuplicate,
  onRevalidate,
  onDelete,
  onRestore,
}: MapeosListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 animate-pulse"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
          <GitMerge className="h-8 w-8 text-indigo-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Sin mapeos
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          No hay mapeos que coincidan con los filtros seleccionados.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Externo
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                →
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Interno
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Conexión
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Última vez visto
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {mappings.map((mapping) => {
              const connection = mapping.connection as any;
              const isDeleted = !!mapping.deleted_at;

              return (
                <tr
                  key={mapping.id}
                  className={cn(
                    'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                    isDeleted && 'opacity-50 bg-red-50/50 dark:bg-red-900/10'
                  )}
                >
                  {/* Externo */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                        <ExternalLink className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <Badge variant="outline" className="text-xs mb-1">
                          {mapping.external_type}
                        </Badge>
                        <p className="font-mono text-sm text-gray-900 dark:text-white">
                          {mapping.external_id}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Flecha */}
                  <td className="px-4 py-3 text-center">
                    <ArrowRight className="h-4 w-4 text-gray-400 mx-auto" />
                  </td>

                  {/* Interno */}
                  <td className="px-4 py-3">
                    <div>
                      <Badge variant="outline" className="text-xs mb-1 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                        {mapping.internal_table}
                      </Badge>
                      <p className="font-mono text-sm text-gray-900 dark:text-white">
                        {mapping.internal_id}
                      </p>
                    </div>
                  </td>

                  {/* Conexión */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/integraciones/conexiones/${mapping.connection_id}`}
                      className="text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {connection?.name || 'Sin nombre'}
                    </Link>
                  </td>

                  {/* Última vez visto */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <Clock className="h-3.5 w-3.5" />
                      {mapping.last_seen_at ? formatDate(mapping.last_seen_at) : 'Nunca'}
                    </div>
                    {isDeleted && (
                      <Badge className="mt-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">
                        Eliminado
                      </Badge>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!isDeleted ? (
                          <>
                            <DropdownMenuItem onClick={() => onEdit(mapping)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDuplicate(mapping)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onRevalidate(mapping)}>
                              <RefreshCcw className="h-4 w-4 mr-2" />
                              Revalidar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onDelete(mapping)}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <DropdownMenuItem onClick={() => onRestore(mapping)}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Restaurar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MapeosList;
