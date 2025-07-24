'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ExternalLink, 
  Download, 
  Clock,
  User,
  Building2,
  Target,
  Calendar,
  FileText
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import type { Activity } from '@/types/activity';
import { ACTIVITY_TYPE_CONFIG } from '@/types/activity';
import { ActividadIcon } from './ActividadIcon';

interface ActividadModalProps {
  activity: Activity;
  isOpen: boolean;
  onClose: () => void;
  onOpenContext?: (activity: Activity) => void;
}

export function ActividadModal({ 
  activity, 
  isOpen, 
  onClose,
  onOpenContext
}: ActividadModalProps) {
  const config = ACTIVITY_TYPE_CONFIG[activity.activity_type];
  const hasAttachments = activity.metadata?.attachments?.length ? activity.metadata.attachments.length > 0 : false;
  const hasLinks = activity.metadata?.links?.length ? activity.metadata.links.length > 0 : false;

  // Función para renderizar metadata de forma legible
  const renderMetadata = (metadata: any) => {
    if (!metadata || typeof metadata !== 'object') return null;
    
    // Diccionario de traducciones al español
    const translations: Record<string, string> = {
      // Campos de llamadas (Call)
      'duration': 'Duración',
      'call_status': 'Estado de llamada',
      'phone_number': 'Número de teléfono',
      'call_direction': 'Dirección de llamada',
      'call_sid': 'ID de llamada',
      'recording_url': 'URL de grabación',
      'from_number': 'Número origen',
      'to_number': 'Número destino',
      'start_time': 'Hora de inicio',
      'end_time': 'Hora de finalización',
      'answered_by': 'Respondido por',
      'forwarded_from': 'Transferido desde',
      'caller_name': 'Nombre del llamador',
      'price': 'Precio',
      'price_unit': 'Moneda',
      
      // Campos de WhatsApp
      'message_id': 'ID del mensaje',
      'chat_id': 'ID del chat',
      'message_type': 'Tipo de mensaje',
      'message_content': 'Contenido del mensaje',
      'is_read': '¿Leído?',
      'delivery_status': 'Estado de entrega',
      'media_type': 'Tipo de archivo',
      'media_url': 'URL del archivo',
      'contact_name': 'Nombre del contacto',
      'contact_phone': 'Teléfono del contacto',
      'group_name': 'Nombre del grupo',
      'message_timestamp': 'Hora del mensaje',
      
      // Campos de Email
      'subject': 'Asunto',
      'email_subject': 'Asunto del correo',
      'sender': 'Remitente',
      'recipient': 'Destinatario',
      'recipients': 'Destinatarios',
      'cc': 'Copia (CC)',
      'bcc': 'Copia oculta (BCC)',
      'attachment_count': 'Número de adjuntos',
      'attachment_size': 'Tamaño de adjuntos',
      'read_status': 'Estado de lectura',
      'email_id': 'ID del correo',
      'thread_id': 'ID de conversación',
      'priority': 'Prioridad',
      'is_spam': '¿Spam?',
      'folder': 'Carpeta',
      
      // Campos de Reuniones (Meeting)
      'meeting_id': 'ID de reunión',
      'meeting_url': 'URL de reunión',
      'meeting_room': 'Sala de reunión',
      'attendees': 'Asistentes',
      'attendees_count': 'Número de asistentes',
      'location': 'Ubicación',
      'platform': 'Plataforma',
      'meeting_type': 'Tipo de reunión',
      'agenda': 'Agenda',
      'recording': 'Grabación',
      'scheduled_start': 'Inicio programado',
      'scheduled_end': 'Fin programado',
      'actual_start': 'Inicio real',
      'actual_end': 'Fin real',
      
      // Campos de Sistema (System)
      'action_type': 'Tipo de acción',
      'resource_id': 'ID del recurso',
      'resource_type': 'Tipo de recurso',
      'user_id': 'ID del usuario',
      'ip_address': 'Dirección IP',
      'user_agent': 'Navegador',
      'session_id': 'ID de sesión',
      'operation': 'Operación',
      'table_name': 'Tabla',
      'record_id': 'ID del registro',
      'old_value': 'Valor anterior',
      'new_value': 'Valor nuevo',
      'change_type': 'Tipo de cambio',
      
      // Campos de Stages/Etapas (Pipeline)
      'to_stage_id': 'ID etapa destino',
      'from_stage_id': 'ID etapa origen',
      'to_stage_name': 'Etapa destino',
      'from_stage_name': 'Etapa origen',
      'stage_id': 'ID de etapa',
      'stage_name': 'Nombre de etapa',
      'stage_order': 'Orden de etapa',
      'stage_type': 'Tipo de etapa',
      'pipeline_id': 'ID del pipeline',
      'pipeline_name': 'Nombre del pipeline',
      'move_reason': 'Motivo del cambio',
      'previous_stage': 'Etapa anterior',
      'current_stage': 'Etapa actual',
      
      // Campos generales
      'status': 'Estado',
      'notes': 'Notas',
      'comments': 'Comentarios',
      'tags': 'Etiquetas',
      'category': 'Categoría',
      'subcategory': 'Subcategoría',
      'created_at': 'Fecha de creación',
      'updated_at': 'Fecha de actualización',
      'created_by': 'Creado por',
      'updated_by': 'Actualizado por',
      'assigned_to': 'Asignado a',
      'due_date': 'Fecha límite',
      'completed_date': 'Fecha de finalización',
      'reminder_date': 'Fecha de recordatorio',
      'follow_up_date': 'Fecha de seguimiento',
      'source': 'Origen',
      'channel': 'Canal',
      'campaign': 'Campaña',
      'reference': 'Referencia',
      'external_id': 'ID externo',
      'score': 'Puntuación',
      'rating': 'Calificación',
      'feedback': 'Retroalimentación',
      'error_code': 'Código de error',
      'error_message': 'Mensaje de error',
      'success': '¿Exitoso?',
      'failed': '¿Fallida?',
      'retry_count': 'Intentos de reintento',
      'timeout': 'Tiempo límite',
      'response_time': 'Tiempo de respuesta'
    };
    
    return Object.entries(metadata)
      .filter(([key]) => key !== 'attachments' && key !== 'links') // Excluir attachments y links ya mostrados
      .map(([key, value]) => {
        const formatKey = (k: string) => {
          // Buscar traducción directa primero
          if (translations[k.toLowerCase()]) {
            return translations[k.toLowerCase()];
          }
          
          // Si no existe traducción, formatear automáticamente
          return k.replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .toLowerCase()
            .replace(/^\w/, c => c.toUpperCase());
        };
        
        const formatValue = (v: any) => {
          if (v === null || v === undefined) return 'No especificado';
          if (typeof v === 'boolean') return v ? 'Sí' : 'No';
          if (typeof v === 'number') {
            // Formatear duración si el campo es duration
            if (key === 'duration') {
              return `${v} segundos`;
            }
            return v.toString();
          }
          if (typeof v === 'string') {
            // Traducciones de valores comunes
            const valueTranslations: Record<string, string> = {
              // Estados de llamadas
              'answered': 'Respondida',
              'busy': 'Ocupado', 
              'no-answer': 'Sin respuesta',
              'failed': 'Fallida',
              'canceled': 'Cancelada',
              'completed': 'Completada',
              'in-progress': 'En proceso',
              'ringing': 'Sonando',
              'queued': 'En cola',
              'inbound': 'Entrante',
              'outbound': 'Saliente',
              'incoming': 'Entrante',
              'outgoing': 'Saliente',
              
              // Estados de WhatsApp
              'sent': 'Enviado',
              'delivered': 'Entregado',
              'read': 'Leído',
              'pending': 'Pendiente',
              'text': 'Texto',
              'image': 'Imagen',
              'video': 'Video',
              'audio': 'Audio',
              'document': 'Documento',
              'location': 'Ubicación',
              'contact': 'Contacto',
              'voice': 'Nota de voz',
              
              // Estados de Email
              'draft': 'Borrador',
              'unread': 'No leído',
              'replied': 'Respondido',
              'forwarded': 'Reenviado',
              'archived': 'Archivado',
              'email_deleted': 'Eliminado',
              'spam': 'Spam',
              'inbox': 'Bandeja de entrada',
              'trash': 'Papelera',
              'high': 'Alta',
              'medium': 'Media',
              'low': 'Baja',
              'normal': 'Normal',
              
              // Estados de Reuniones
              'scheduled': 'Programada',
              'started': 'Iniciada',
              'ended': 'Finalizada',
              'postponed': 'Pospuesta',
              'virtual': 'Virtual',
              'presencial': 'Presencial',
              'hybrid': 'Híbrida',
              'zoom': 'Zoom',
              'teams': 'Microsoft Teams',
              'meet': 'Google Meet',
              'webex': 'Webex',
              
              // Estados de Sistema
              'created': 'Creado',
              'updated': 'Actualizado',
              'deleted': 'Eliminado',
              'viewed': 'Visualizado',
              'login': 'Inicio de sesión',
              'logout': 'Cierre de sesión',
              'error': 'Error',
              'warning': 'Advertencia',
              'info': 'Información',
              'debug': 'Depuración',
              
              // Estados generales
              'active': 'Activo',
              'inactive': 'Inactivo',
              'enabled': 'Habilitado',
              'disabled': 'Deshabilitado',
              'approved': 'Aprobado',
              'rejected': 'Rechazado',
              'pending_approval': 'Pendiente de aprobación',
              'open': 'Abierto',
              'closed': 'Cerrado',
              'resolved': 'Resuelto',
              'escalated': 'Escalado',
              'assigned': 'Asignado',
              'unassigned': 'Sin asignar',
              'public': 'Público',
              'private': 'Privado',
              'internal': 'Interno',
              'external': 'Externo',
              'yes': 'Sí',
              'no': 'No',
              'true': 'Verdadero',
              'false': 'Falso',
              'success': 'Exitoso',
              'failure': 'Fallido'
            };
            
            return valueTranslations[v.toLowerCase()] || v;
          }
          if (typeof v === 'object') return JSON.stringify(v, null, 2);
          return String(v);
        };
        
        return (
          <div key={key} className="flex justify-between items-start">
            <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">
              {formatKey(key)}:
            </span>
            <span className="text-gray-600 dark:text-gray-400 text-right flex-1 ml-3">
              {formatValue(value)}
            </span>
          </div>
        );
      });
  };

  const getContextUrl = () => {
    if (!activity.related_type || !activity.related_id) return null;
    
    switch (activity.related_type) {
      case 'customer':
        return `/app/clientes/${activity.related_id}`;
      case 'opportunity':
        return `/app/crm/pipeline?opportunity=${activity.related_id}`;
      case 'task':
        return `/app/crm/tareas?task=${activity.related_id}`;
      default:
        return null;
    }
  };

  const contextUrl = getContextUrl();

  return (
    <Dialog open={isOpen}>
      <DialogContent 
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <ActividadIcon type={activity.activity_type} />
            <div>
              <div className="flex items-center gap-2">
                <span>Detalles de Actividad</span>
                <Badge variant="secondary" className={config.color}>
                  {config.label}
                </Badge>
              </div>
              <div className="text-sm font-normal text-gray-500 dark:text-gray-400 mt-1">
                {formatDate(new Date(activity.occurred_at))}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información básica */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="font-medium">Fecha de ocurrencia</div>
                  <div className="text-gray-600 dark:text-gray-400">
                    {formatDate(new Date(activity.occurred_at))}
                  </div>
                </div>
              </div>

              {activity.user_name && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="font-medium">Usuario</div>
                    <div className="text-gray-600 dark:text-gray-400">
                      {activity.user_name}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="font-medium">Fecha de registro</div>
                  <div className="text-gray-600 dark:text-gray-400">
                    {formatDate(new Date(activity.created_at))}
                  </div>
                </div>
              </div>

              {activity.related_entity_name && (
                <div className="flex items-center gap-2">
                  {activity.related_type === 'customer' && <Building2 className="h-4 w-4 text-gray-400" />}
                  {activity.related_type === 'opportunity' && <Target className="h-4 w-4 text-gray-400" />}
                  {activity.related_type === 'task' && <FileText className="h-4 w-4 text-gray-400" />}
                  <div>
                    <div className="font-medium">Relacionado con</div>
                    <div className="text-gray-600 dark:text-gray-400">
                      {activity.related_entity_name}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notas/Descripción */}
          {activity.notes && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Descripción
                </h4>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap">
                    {activity.notes}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Enlaces */}
          {hasLinks && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Enlaces ({activity.metadata.links?.length})
                </h4>
                <div className="space-y-2">
                  {activity.metadata.links?.map((link, index) => (
                    <div 
                      key={link.id || index}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {link.title}
                        </div>
                        {link.description && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {link.description}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="ml-2"
                      >
                        <a 
                          href={link.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Adjuntos */}
          {hasAttachments && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Adjuntos ({activity.metadata.attachments?.length})
                </h4>
                <div className="space-y-2">
                  {activity.metadata.attachments?.map((attachment, index) => (
                    <div 
                      key={attachment.id || index}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {attachment.name}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {attachment.type} • {(attachment.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="ml-2"
                      >
                        <a 
                          href={attachment.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          download={attachment.name}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Metadata adicional */}
          {activity.metadata && Object.keys(activity.metadata).length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium mb-3">Información adicional</h4>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                  {renderMetadata(activity.metadata)}
                </div>
              </div>
            </>
          )}

          {/* Acciones */}
          <div className="flex justify-between pt-4 border-t">
            <div>
              {contextUrl && onOpenContext && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    onOpenContext(activity);
                    onClose(); // Cerrar el modal actual
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver más
                </Button>
              )}
            </div>
            
            <Button onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
