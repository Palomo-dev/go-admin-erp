'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Mail,
  Users,
  StickyNote,
  MapPin,
  MessageCircle,
  MessageSquare,
  Bot,
  CheckSquare,
  Settings,
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  User,
  Briefcase,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarPlus,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, ACTIVITY_TYPE_CONFIG, formatDuration, outcomeLabel } from './types';

interface ActividadesTableProps {
  activities: Activity[];
  isLoading?: boolean;
  /** Hay filtros aplicados: el vacío significa «sin resultados», no «sin datos». */
  hasFilters?: boolean;
  onEdit: (activity: Activity) => void;
  onDuplicate: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  onCreate?: () => void;
  onClearFilters?: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Phone,
  Mail,
  Users,
  StickyNote,
  MapPin,
  MessageCircle,
  MessageSquare,
  Bot,
  CheckSquare,
  Settings,
};

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Iniciales del autor para el avatar de la columna «Quién». */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function ActividadesTable({
  activities,
  isLoading,
  hasFilters,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
  onClearFilters,
}: ActividadesTableProps) {
  const router = useRouter();

  const handleViewDetail = (activity: Activity) => {
    router.push(`/app/crm/actividades/${activity.id}`);
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-12 text-center">
          <StickyNote className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            {hasFilters ? 'Ninguna actividad coincide con los filtros' : 'Todavía no hay actividades'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {hasFilters
              ? 'Prueba con otro rango de fechas, otro tipo o quita los filtros.'
              : 'Registra llamadas, correos, WhatsApp, reuniones y notas para tener el historial del cliente en un solo sitio.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            {hasFilters && onClearFilters && (
              <Button variant="outline" onClick={onClearFilters}>
                Quitar filtros
              </Button>
            )}
            {onCreate && (
              <Button onClick={onCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
                <CalendarPlus className="h-4 w-4 mr-2" />
                Nueva actividad
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold">Actividad</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold hidden md:table-cell">Con quién</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold hidden lg:table-cell">Resultado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold hidden lg:table-cell">Registró</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold hidden sm:table-cell">Cuándo</TableHead>
              <TableHead className="w-10 sm:w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((activity) => {
              const config = ACTIVITY_TYPE_CONFIG[activity.activity_type] || ACTIVITY_TYPE_CONFIG.note;
              const Icon = iconMap[config.icon] || StickyNote;
              const duration = formatDuration(activity.duration_seconds);
              const result = outcomeLabel(activity.activity_type, activity.outcome);
              const isInbound = activity.channel === 'inbound';
              const DirectionIcon = isInbound ? ArrowDownLeft : ArrowUpRight;
              const authorName = activity.user?.full_name || activity.user?.email || null;
              const relatedHref =
                activity.related_type === 'customer' && activity.related_id
                  ? `/app/crm/clientes/${activity.related_id}`
                  : activity.related_type === 'opportunity' && activity.related_id
                    ? `/app/crm/oportunidades/${activity.related_id}`
                    : null;
              const relatedName =
                activity.customer?.full_name ?? activity.opportunity?.title ?? null;

              return (
                <TableRow
                  key={activity.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700/50"
                  onClick={() => handleViewDetail(activity)}
                >
                  {/* Actividad: tipo, sentido, duración y resumen */}
                  <TableCell className="py-2 sm:py-3">
                    <div className="flex items-start gap-2.5">
                      <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${config.bgColor} ${config.darkBgColor}`}>
                        <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${config.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={`text-[10px] sm:text-xs ${config.color} dark:border-gray-600`}>
                            {config.label}
                          </Badge>
                          {activity.channel === 'inbound' || activity.channel === 'outbound' ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 dark:text-gray-400"
                              title={isInbound ? 'Entrante' : 'Saliente'}
                            >
                              <DirectionIcon className="h-3 w-3" />
                              {isInbound ? 'Entrante' : 'Saliente'}
                            </span>
                          ) : null}
                          {duration && (
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">· {duration}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs sm:text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                          {activity.notes?.trim() || <span className="text-gray-400">Sin descripción</span>}
                        </p>
                        <div className="sm:hidden mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                          {formatDateTime(activity.occurred_at)}
                          {relatedName ? ` · ${relatedName}` : ''}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Con quién: abre la ficha relacionada */}
                  <TableCell className="py-2 sm:py-3 hidden md:table-cell">
                    {relatedHref && relatedName ? (
                      <Link
                        href={relatedHref}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {activity.related_type === 'customer' ? (
                          <User className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Briefcase className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate max-w-[160px]">{relatedName}</span>
                      </Link>
                    ) : (
                      <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </TableCell>

                  {/* Resultado */}
                  <TableCell className="py-2 sm:py-3 hidden lg:table-cell">
                    {result ? (
                      <Badge variant="secondary" className="text-[10px] sm:text-xs">
                        {result}
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </TableCell>

                  {/* Quién lo registró */}
                  <TableCell className="py-2 sm:py-3 hidden lg:table-cell">
                    {authorName ? (
                      <div className="flex items-center gap-2" title={activity.user?.email || undefined}>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                          {initials(authorName) || '?'}
                        </span>
                        <span className="truncate max-w-[120px] text-xs text-gray-700 dark:text-gray-300">
                          {authorName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Sistema</span>
                    )}
                  </TableCell>

                  {/* Cuándo */}
                  <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDateTime(activity.occurred_at)}
                    </span>
                  </TableCell>

                  <TableCell className="py-2 sm:py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Acciones de la actividad"
                          className="h-8 w-8 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <DropdownMenuItem
                          className="text-gray-700 dark:text-gray-300 focus:bg-gray-100 dark:focus:bg-gray-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetail(activity);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver detalle
                        </DropdownMenuItem>
                        {relatedHref && (
                          <DropdownMenuItem
                            className="text-gray-700 dark:text-gray-300 focus:bg-gray-100 dark:focus:bg-gray-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(relatedHref);
                            }}
                          >
                            {activity.related_type === 'customer' ? (
                              <User className="h-4 w-4 mr-2" />
                            ) : (
                              <Briefcase className="h-4 w-4 mr-2" />
                            )}
                            Abrir {activity.related_type === 'customer' ? 'cliente' : 'oportunidad'}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-gray-700 dark:text-gray-300 focus:bg-gray-100 dark:focus:bg-gray-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(activity);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-gray-700 dark:text-gray-300 focus:bg-gray-100 dark:focus:bg-gray-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(activity);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-700" />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(activity);
                          }}
                          className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/30"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
