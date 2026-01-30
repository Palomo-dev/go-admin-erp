'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Mail,
  Users,
  StickyNote,
  MapPin,
  MessageCircle,
  Settings,
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  User,
  Briefcase,
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
import { formatDate } from '@/utils/Utils';
import { Activity, ACTIVITY_TYPE_CONFIG } from './types';

interface ActividadesTableProps {
  activities: Activity[];
  isLoading?: boolean;
  onEdit: (activity: Activity) => void;
  onDuplicate: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Phone,
  Mail,
  Users,
  StickyNote,
  MapPin,
  MessageCircle,
  Settings,
};

export function ActividadesTable({
  activities,
  isLoading,
  onEdit,
  onDuplicate,
  onDelete,
}: ActividadesTableProps) {
  const router = useRouter();

  const handleViewDetail = (activity: Activity) => {
    router.push(`/app/crm/actividades/${activity.id}`);
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Cargando actividades...</p>
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-12 text-center">
          <StickyNote className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No hay actividades
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Crea tu primera actividad para comenzar a registrar el historial.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-900">
            <TableHead className="w-12">Tipo</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Relacionado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity) => {
            const config = ACTIVITY_TYPE_CONFIG[activity.activity_type] || ACTIVITY_TYPE_CONFIG.note;
            const Icon = iconMap[config.icon] || StickyNote;

            return (
              <TableRow
                key={activity.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer"
                onClick={() => handleViewDetail(activity)}
              >
                <TableCell>
                  <div className={`p-2 rounded-lg ${config.bgColor} ${config.darkBgColor} w-fit`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <Badge variant="outline" className={`mb-1 ${config.color}`}>
                      {config.label}
                    </Badge>
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                      {activity.notes || 'Sin descripción'}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  {activity.related_type === 'customer' && activity.customer ? (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {activity.customer.full_name}
                      </span>
                    </div>
                  ) : activity.related_type === 'opportunity' && activity.opportunity ? (
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {activity.opportunity.title}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {formatDateTime(activity.occurred_at)}
                  </span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewDetail(activity); }}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalle
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(activity); }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(activity); }}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); onDelete(activity); }}
                        className="text-red-600 dark:text-red-400"
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
  );
}
