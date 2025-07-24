'use client'

import { useActivityRealtime } from '@/lib/hooks/useActivityRealtime'
import { Badge } from '@/components/ui/badge'
import { Bell, Phone, Mail, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Indicador visual de actividades en tiempo real
 * Muestra estado de conexión y nuevas actividades
 */
export function ActivityRealtimeIndicator() {
  const { newActivity, isConnected, clearNewActivity } = useActivityRealtime()
  const [showNotification, setShowNotification] = useState(false)

  // Mostrar notificación cuando llega nueva actividad
  useEffect(() => {
    if (newActivity) {
      setShowNotification(true)
      // Auto-ocultar después de 5 segundos
      const timer = setTimeout(() => {
        setShowNotification(false)
        clearNewActivity()
      }, 5000)
      
      return () => clearTimeout(timer)
    }
  }, [newActivity, clearNewActivity])

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4" />
      case 'email': return <Mail className="h-4 w-4" />
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />
      default: return <Bell className="h-4 w-4" />
    }
  }

  const getActivityTypeLabel = (type: string) => {
    switch (type) {
      case 'call': return 'Llamada'
      case 'email': return 'Email'
      case 'whatsapp': return 'WhatsApp'
      case 'visit': return 'Visita'
      case 'note': return 'Nota'
      default: return 'Actividad'
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {/* Indicador de conexión - Solo en desarrollo */}
      {process.env.NODE_ENV === 'development' && (
        <div className="flex items-center gap-2">
          <Badge 
            variant={isConnected ? "default" : "secondary"}
            className="text-xs"
          >
            <div 
              className={`w-2 h-2 rounded-full mr-1 ${
                isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
              }`}
            />
            {isConnected ? 'Tiempo real activo' : 'Desconectado'}
          </Badge>
        </div>
      )}

      {/* Notificación de nueva actividad - Siempre visible */}
      {showNotification && newActivity && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm animate-slide-in-right">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 p-2 bg-blue-100 rounded-full">
              {getActivityIcon(newActivity.activity_type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900">
                  Nueva {getActivityTypeLabel(newActivity.activity_type)}
                </h4>
                <Badge variant="outline" className="text-xs">
                  Ahora
                </Badge>
              </div>
              
              <p className="text-sm text-gray-600 mt-1 truncate">
                {newActivity.notes || 'Sin descripción'}
              </p>

              {/* Información adicional para llamadas */}
              {newActivity.activity_type === 'call' && newActivity.metadata?.phone_number && (
                <p className="text-xs text-gray-500 mt-1">
                  📞 {newActivity.metadata.phone_number}
                </p>
              )}

              {/* Usuario asignado */}
              {newActivity.user_name && (
                <p className="text-xs text-gray-500 mt-1">
                  👤 {newActivity.user_name}
                </p>
              )}
            </div>

            <button
              onClick={() => setShowNotification(false)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600"
            >
              <span className="sr-only">Cerrar</span>
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
