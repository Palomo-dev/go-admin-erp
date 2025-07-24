'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Building2, Calendar, Phone, Mail, MapPin, FileText, Target, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn, formatDate } from '@/utils/Utils';
import type { Activity } from '@/types/activity';
import { supabase } from '@/lib/supabase/config';
import { ACTIVITY_TYPE_CONFIG, ActivityType } from '@/types/activity';

interface ActividadContextPanelProps {
  activity: Activity | null;
  isOpen: boolean;
  onClose: () => void;
}

interface RelatedEntity {
  id: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  description?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  notes?: string;
  expected_close_date?: string;
  amount?: number;
  currency?: string;
  loss_reason?: string;
  type?: string;
}

import { translateOpportunityStatus, getOpportunityStatusBadgeVariant } from '@/utils/crmTranslations';

export function ActividadContextPanel({ activity, isOpen, onClose }: ActividadContextPanelProps) {
  const [relatedEntity, setRelatedEntity] = useState<RelatedEntity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos de la entidad relacionada
  useEffect(() => {
    if (!activity || !activity.related_type || !activity.related_id || !isOpen) {
      setRelatedEntity(null);
      return;
    }

    const loadRelatedEntity = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let query;
        let tableName: string;
        
        switch (activity.related_type) {
          case 'customer':
            tableName = 'customers';
            query = supabase
              .from('customers')
              .select('id, first_name, last_name, email, phone, address, city, notes')
              .eq('id', activity.related_id)
              .single();
            break;
            
          case 'opportunity':
            tableName = 'opportunities';
            query = supabase
              .from('opportunities')
              .select('id, name, status, amount, currency, expected_close_date, loss_reason')
              .eq('id', activity.related_id)
              .single();
            break;
            
          case 'task':
            tableName = 'tasks';
            query = supabase
              .from('tasks')
              .select('id, title, status, priority, due_date, description')
              .eq('id', activity.related_id)
              .single();
            break;
            
          default:
            throw new Error(`Tipo de entidad no soportado: ${activity.related_type}`);
        }

        console.log(`🔍 Ejecutando consulta para ${tableName} con ID:`, activity.related_id);
        const { data, error } = await query;
        
        console.log(`📊 Resultado de ${tableName}:`, { data, error });
        
        if (error) {
          console.error(`❌ Error al cargar ${tableName}:`, {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          
          // Manejo específico para referencias rotas
          if (error.code === 'PGRST116' || error.message.includes('No rows found')) {
            setError(`La referencia a ${tableName} ya no existe. Este registro puede haber sido eliminado.`);
          } else {
            setError(`Error al cargar los datos: ${error.message}`);
          }
          return;
        }

        if (!data) {
          console.warn(`⚠️ No se encontró ${tableName} con ID:`, activity.related_id);
          setError(`La referencia a ${tableName} ya no existe. Este registro puede haber sido eliminado.`);
          return;
        }

        console.log(`✅ ${tableName} cargado exitosamente:`, data);
        setRelatedEntity(data);
      } catch (err) {
        console.error(`❌ Error al cargar entidad relacionada (${activity.related_type}):`, err);
        console.error('Actividad:', {
          id: activity.id,
          related_type: activity.related_type,
          related_id: activity.related_id,
          notes: activity.notes
        });
        
        if (err instanceof Error) {
          setError(`Error inesperado: ${err.message}`);
        } else {
          setError('Error desconocido al cargar la información');
        }
      } finally {
        setLoading(false);
      }
    };

    loadRelatedEntity();
  }, [activity, isOpen]);

  if (!isOpen || !activity) return null;

  const renderEntityDetails = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      );
    }

    if (!relatedEntity) {
      return (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 text-sm">No se encontró información de la entidad relacionada.</p>
        </div>
      );
    }

    // Renderizar según el tipo de entidad
    switch (activity.related_type) {
      case 'customer':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  {relatedEntity.first_name} {relatedEntity.last_name}
                </h3>
                {relatedEntity.city && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{relatedEntity.city}</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {relatedEntity.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{relatedEntity.email}</span>
                </div>
              )}
              
              {relatedEntity.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{relatedEntity.phone}</span>
                </div>
              )}
              
              {relatedEntity.address && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{relatedEntity.address}</span>
                </div>
              )}
            </div>
          </div>
        );

      case 'opportunity':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-green-600" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">{relatedEntity.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={getOpportunityStatusBadgeVariant(relatedEntity.status || '')}>
                    {translateOpportunityStatus(relatedEntity.status || '')}
                  </Badge>
                  {relatedEntity.amount && (
                    <Badge variant="outline">{relatedEntity.amount} {relatedEntity.currency || 'USD'}</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {relatedEntity.expected_close_date && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Cierre esperado: {formatDate(new Date(relatedEntity.expected_close_date))}
                  </span>
                </div>
              )}
              
              {relatedEntity.description && (
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-gray-500 mt-0.5" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">{relatedEntity.description}</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'task':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-purple-600" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">{relatedEntity.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={relatedEntity.status === 'completed' ? 'default' : 'secondary'}>
                    {relatedEntity.status}
                  </Badge>
                  {relatedEntity.priority && (
                    <Badge variant="outline">{relatedEntity.priority}</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {relatedEntity.due_date && (
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Fecha límite: {formatDate(new Date(relatedEntity.due_date))}
                  </span>
                </div>
              )}
              
              {relatedEntity.description && (
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-gray-500 mt-0.5" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">{relatedEntity.description}</p>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      
      {/* Panel lateral */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 shadow-xl z-50 transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Contexto de Actividad
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                {activity.related_type === 'customer' ? 'Cliente' : 
                 activity.related_type === 'opportunity' ? 'Oportunidad' :
                 activity.related_type === 'task' ? 'Tarea' : activity.related_type}
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {/* Información de la actividad */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Actividad</h3>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="outline">
                      {ACTIVITY_TYPE_CONFIG[activity.activity_type as ActivityType]?.label || activity.activity_type}
                    </Badge>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(new Date(activity.occurred_at))}
                    </span>
                  </div>
                  {activity.notes && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                      {activity.notes}
                    </p>
                  )}
                  {activity.user_name && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Por: {activity.user_name}
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Información de la entidad relacionada */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  Detalles {activity.related_type === 'customer' ? 'del Cliente' : 
                           activity.related_type === 'opportunity' ? 'de la Oportunidad' :
                           activity.related_type === 'task' ? 'de la Tarea' : 'de la Entidad'}
                </h3>
                {renderEntityDetails()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
