/**
 * Tabla para mostrar y gestionar triggers de eventos
 */

'use client';

import React from 'react';
import { 
  Edit, 
  Trash2, 
  Play, 
  Pause, 
  TestTube, 
  MoreHorizontal,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Types
import type { EventTrigger, NotificationChannel } from '@/types/eventTrigger';

export interface EventTriggersTableProps {
  triggers: EventTrigger[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    count: number;
  };
  onPageChange: (page: number) => void;
  onEditTrigger?: (trigger: EventTrigger) => void;
  onToggleTrigger?: (id: string) => void;
  onDeleteTrigger?: (id: string) => void;
  onTestTrigger?: (id: string) => void;
  onRefresh?: () => void;
}

export function EventTriggersTable({
  triggers,
  pagination,
  onPageChange,
  onEditTrigger,
  onToggleTrigger,
  onDeleteTrigger,
  onTestTrigger,
  onRefresh
}: EventTriggersTableProps) {

  // Configuración de canales para display
  const getChannelConfig = (channel: NotificationChannel) => {
    const configs = {
      email: { label: 'Email', icon: '📧', color: 'bg-blue-100 text-blue-800' },
      whatsapp: { label: 'WhatsApp', icon: '📱', color: 'bg-green-100 text-green-800' },
      webhook: { label: 'Webhook', icon: '🔗', color: 'bg-purple-100 text-purple-800' },
      push: { label: 'Push', icon: '🔔', color: 'bg-orange-100 text-orange-800' },
      sms: { label: 'SMS', icon: '💬', color: 'bg-yellow-100 text-yellow-800' }
    };
    return configs[channel] || { label: channel, icon: '📋', color: 'bg-gray-100 text-gray-800' };
  };

  // Formatear fecha
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Render canales
  const renderChannels = (channels: NotificationChannel[]) => {
    return (
      <div className="flex flex-wrap gap-1">
        {channels.slice(0, 3).map((channel) => {
          const config = getChannelConfig(channel);
          return (
            <Badge key={channel} variant="outline" className={`text-xs ${config.color}`}>
              <span className="mr-1">{config.icon}</span>
              {config.label}
            </Badge>
          );
        })}
        {channels.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{channels.length - 3} más
          </Badge>
        )}
      </div>
    );
  };

  // Render prioridad
  const renderPriority = (priority: number) => {
    const getColorByPriority = (p: number) => {
      if (p <= 2) return 'bg-red-100 text-red-800 border-red-200';
      if (p <= 5) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      return 'bg-green-100 text-green-800 border-green-200';
    };

    return (
      <Badge variant="outline" className={getColorByPriority(priority)}>
        {priority}
      </Badge>
    );
  };

  // Render paginación simple
  const renderPagination = () => {
    const { page, totalPages, count } = pagination;
    
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          Mostrando {triggers.length} de {count} triggers
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <div className="text-sm">
            Página {page} de {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Triggers de Eventos</CardTitle>
            <CardDescription>
              {pagination.count} trigger{pagination.count !== 1 ? 's' : ''} configurado{pagination.count !== 1 ? 's' : ''}
            </CardDescription>
          </div>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {triggers.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-lg font-medium mb-2">No hay triggers configurados</h3>
            <p className="text-muted-foreground">
              Crea tu primer trigger para comenzar a automatizar acciones
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Canales</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="w-[100px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              
              <TableBody>
                {triggers.map((trigger) => (
                  <TableRow key={trigger.id}>
                    {/* Nombre */}
                    <TableCell>
                      <div>
                        <div className="font-medium">{trigger.name}</div>
                        {trigger.silent_window_minutes > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Ventana silenciosa: {trigger.silent_window_minutes}min
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Evento */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {trigger.event_code}
                        </Badge>
                      </div>
                    </TableCell>

                    {/* Canales */}
                    <TableCell>
                      {renderChannels(trigger.channels)}
                    </TableCell>

                    {/* Prioridad */}
                    <TableCell>
                      {renderPriority(trigger.priority)}
                    </TableCell>

                    {/* Estado */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div 
                          className={`w-2 h-2 rounded-full ${
                            trigger.active ? 'bg-green-500' : 'bg-gray-400'
                          }`} 
                        />
                        <span className="text-sm">
                          {trigger.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </TableCell>

                    {/* Fecha creación */}
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(trigger.created_at)}
                    </TableCell>

                    {/* Acciones */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menú</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                          
                          {/* Editar */}
                          {onEditTrigger && (
                            <DropdownMenuItem onClick={() => onEditTrigger(trigger)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                          )}

                          {/* Toggle estado */}
                          {onToggleTrigger && (
                            <DropdownMenuItem onClick={() => onToggleTrigger(trigger.id)}>
                              {trigger.active ? (
                                <>
                                  <Pause className="mr-2 h-4 w-4" />
                                  Desactivar
                                </>
                              ) : (
                                <>
                                  <Play className="mr-2 h-4 w-4" />
                                  Activar
                                </>
                              )}
                            </DropdownMenuItem>
                          )}

                          {/* Probar */}
                          {onTestTrigger && trigger.active && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onTestTrigger(trigger.id)}>
                                <TestTube className="mr-2 h-4 w-4" />
                                Probar
                              </DropdownMenuItem>
                            </>
                          )}

                          {/* Eliminar */}
                          {onDeleteTrigger && (
                            <>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar trigger?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no se puede deshacer. El trigger "{trigger.name}" 
                                      será eliminado permanentemente.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => onDeleteTrigger(trigger.id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Paginación */}
            <div className="p-4 border-t">
              {renderPagination()}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default EventTriggersTable;
