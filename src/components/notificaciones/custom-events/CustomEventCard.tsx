'use client';

import { useState } from 'react';
import { Edit, Trash2, Power, PowerOff, Code, Calendar, Tag, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type CustomEvent } from '@/lib/services/customEventsService';

interface CustomEventCardProps {
  event: CustomEvent;
  onEdit: (event: CustomEvent) => void;
  onDelete: (eventId: string) => void;
  onToggleStatus: (eventId: string, isActive: boolean) => void;
}

export function CustomEventCard({ event, onEdit, onDelete, onToggleStatus }: CustomEventCardProps) {
  const [showPayload, setShowPayload] = useState(false);

  // ========================================
  // CONFIGURACIÓN DE COLORES POR MÓDULO
  // ========================================

  const getModuleColor = (module: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      crm: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-700' },
      ventas: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-700' },
      inventario: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-700' },
      finanzas: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-700' },
      rrhh: { bg: 'bg-pink-50 dark:bg-pink-900/20', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-700' },
      pms: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-700' },
      custom: { bg: 'bg-gray-50 dark:bg-gray-900/20', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-200 dark:border-gray-700' }
    };
    return colors[module] || colors.custom;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      system: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      business: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
      custom: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
    };
    return colors[category] || colors.custom;
  };

  // ========================================
  // FORMATEO DE DATOS
  // ========================================

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateCode = (code: string, maxLength: number = 30) => {
    return code.length > maxLength ? `${code.substring(0, maxLength)}...` : code;
  };

  const hasPayloadData = event.sample_payload && Object.keys(event.sample_payload).length > 0;

  const moduleColors = getModuleColor(event.module);

  // ========================================
  // RENDER
  // ========================================

  return (
    <Card className={`relative transition-all duration-200 hover:shadow-lg ${moduleColors.border} ${event.is_active ? '' : 'opacity-60'}`}>
      {/* Indicador de estado */}
      <div className={`absolute top-0 left-0 w-1 h-full ${event.is_active ? 'bg-green-500' : 'bg-red-500'} rounded-l-lg`} />
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={getCategoryColor(event.category)}>
                {event.category === 'business' ? 'Negocio' : 'Personalizado'}
              </Badge>
              <Badge variant="outline" className={`${moduleColors.text} ${moduleColors.border}`}>
                {event.module.toUpperCase()}
              </Badge>
            </div>
            
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white truncate">
              {event.name}
            </h3>
            
            <div className="flex items-center gap-1 mt-1">
              <Code className="h-3 w-3 text-gray-500" />
              <span className="text-sm text-gray-500 font-mono" title={event.code}>
                {truncateCode(event.code)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleStatus(event.id, !event.is_active)}
              className={`p-1 h-8 w-8 ${event.is_active ? 'text-green-600 hover:text-green-700' : 'text-red-600 hover:text-red-700'}`}
              title={event.is_active ? 'Desactivar evento' : 'Activar evento'}
            >
              {event.is_active ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(event)}
              className="p-1 h-8 w-8 text-blue-600 hover:text-blue-700"
              title="Editar evento"
            >
              <Edit className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(event.id)}
              className="p-1 h-8 w-8 text-red-600 hover:text-red-700"
              title="Eliminar evento"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Descripción */}
        {event.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
            {event.description}
          </p>
        )}

        {/* Información del payload */}
        {hasPayloadData && (
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPayload(!showPayload)}
              className="flex items-center gap-2 p-2 w-full justify-start text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
            >
              {showPayload ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="text-sm">
                {showPayload ? 'Ocultar' : 'Ver'} payload de ejemplo
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                {Object.keys(event.sample_payload).length} campos
              </span>
            </Button>

            {showPayload && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                  {JSON.stringify(event.sample_payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Footer con metadatos */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>Creado {formatDate(event.created_at)}</span>
          </div>
          
          <div className="flex items-center gap-2">
            {event.updated_at !== event.created_at && (
              <span className="text-xs text-gray-400">
                Editado {formatDate(event.updated_at)}
              </span>
            )}
            
            <div className={`w-2 h-2 rounded-full ${event.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
