'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  RefreshCw, 
  Snowflake, 
  XCircle, 
  CreditCard, 
  LogIn,
  AlertTriangle,
  FileText,
  History,
  User,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { MembershipEvent } from '@/lib/services/gymService';

interface MembershipTimelineProps {
  events: MembershipEvent[];
  isLoading?: boolean;
  maxVisible?: number;
}

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: CheckCircle2,
  activated: CheckCircle2,
  renewed: RefreshCw,
  frozen: Snowflake,
  unfrozen: RefreshCw,
  cancelled: XCircle,
  expired: AlertTriangle,
  payment_received: CreditCard,
  payment_failed: AlertTriangle,
  access_granted: LogIn,
  access_denied: XCircle,
  plan_changed: RefreshCw,
  notes_updated: FileText,
  status_changed: Info
};

const EVENT_COLORS: Record<string, string> = {
  created: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  activated: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  renewed: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  frozen: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  unfrozen: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  payment_received: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  payment_failed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  access_granted: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  access_denied: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  plan_changed: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  notes_updated: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  status_changed: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
};

const EVENT_LABELS: Record<string, string> = {
  created: 'Membresía creada',
  activated: 'Membresía activada',
  renewed: 'Membresía renovada',
  frozen: 'Membresía congelada',
  unfrozen: 'Membresía descongelada',
  cancelled: 'Membresía cancelada',
  expired: 'Membresía expirada',
  payment_received: 'Pago recibido',
  payment_failed: 'Pago fallido',
  access_granted: 'Acceso permitido',
  access_denied: 'Acceso denegado',
  plan_changed: 'Plan modificado',
  notes_updated: 'Notas actualizadas',
  status_changed: 'Estado cambiado'
};

export function MembershipTimeline({ events, isLoading, maxVisible = 10 }: MembershipTimelineProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  
  const visibleEvents = showAll ? events : events.slice(0, maxVisible);
  const hasMore = events.length > maxVisible;

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="animate-pulse h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex gap-4">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <History className="h-5 w-5 text-purple-600" />
            Trazabilidad Completa
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {events.length} eventos
          </Badge>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Registro de todas las acciones realizadas en esta membresía
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-6">
            <History className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No hay eventos registrados
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
            
            <div className="space-y-3">
              {visibleEvents.map((event) => {
                const Icon = EVENT_ICONS[event.event_type] || FileText;
                const colorClass = EVENT_COLORS[event.event_type] || EVENT_COLORS.notes_updated;
                const label = EVENT_LABELS[event.event_type] || event.event_type;
                const date = new Date(event.created_at);
                const isExpanded = expandedEvent === event.id;
                const hasDetails = event.old_value || event.new_value || event.metadata;
                
                return (
                  <div 
                    key={event.id} 
                    className="relative flex gap-3 pl-2 cursor-pointer"
                    onClick={() => hasDetails && setExpandedEvent(isExpanded ? null : event.id)}
                  >
                    <div className={cn(
                      "relative z-10 p-2 rounded-full shrink-0",
                      colorClass
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    
                    <div className={cn(
                      "flex-1 p-3 rounded-lg transition-colors",
                      hasDetails ? "hover:bg-gray-50 dark:hover:bg-gray-900/50" : "",
                      isExpanded ? "bg-gray-50 dark:bg-gray-900/50" : ""
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm text-gray-900 dark:text-white">
                            {event.description || label}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>{date.toLocaleDateString('es-CO')}</span>
                            <span>•</span>
                            <span>{date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                            {event.performed_by && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  Usuario
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {hasDetails && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Detalles expandidos */}
                      {isExpanded && hasDetails && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                          {event.old_value && (
                            <div className="text-xs">
                              <span className="text-gray-500 dark:text-gray-400">Valor anterior: </span>
                              <code className="px-1 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
                                {typeof event.old_value === 'object' 
                                  ? JSON.stringify(event.old_value) 
                                  : String(event.old_value)}
                              </code>
                            </div>
                          )}
                          {event.new_value && (
                            <div className="text-xs">
                              <span className="text-gray-500 dark:text-gray-400">Valor nuevo: </span>
                              <code className="px-1 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                                {typeof event.new_value === 'object' 
                                  ? JSON.stringify(event.new_value) 
                                  : String(event.new_value)}
                              </code>
                            </div>
                          )}
                          {event.metadata && (
                            <div className="text-xs">
                              <span className="text-gray-500 dark:text-gray-400">Metadata: </span>
                              <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                                {JSON.stringify(event.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                          {event.ip_address && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              IP: {event.ip_address}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className="w-full mt-3 text-gray-600 dark:text-gray-400"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Ver {events.length - maxVisible} eventos más
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MembershipTimeline;
