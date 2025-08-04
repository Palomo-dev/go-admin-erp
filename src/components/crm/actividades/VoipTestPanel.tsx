'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Loader2 } from 'lucide-react'
import { obtenerOrganizacionActiva, getCurrentUserId } from '@/lib/hooks/useOrganization'

/**
 * 🧪 Panel de pruebas para simular eventos VOIP
 * Solo visible en desarrollo
 */
export function VoipTestPanel() {
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState<any>(null)
  const [formData, setFormData] = useState({
    event: 'answered',
    from: '+1234567890',
    to: '+0987654321',
    direction: 'inbound',
    duration: 45
  })

  // Solo mostrar en desarrollo
  if (process.env.NODE_ENV === 'production') return null

  const handleSimulateCall = async () => {
    setLoading(true)
    try {
      // Obtener organización activa desde el cliente
      const organization = obtenerOrganizacionActiva()
      
      // Obtener usuario actual desde el cliente
      const userId = await getCurrentUserId()
      
      // Incluir organización y userId en el request
      const requestData = {
        ...formData,
        organizationId: organization.id,
        userId: userId
      }
      
      console.log('📤 Enviando datos:', requestData)
      
      const response = await fetch('/api/test/voip-simulation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      })

      console.log('📥 Respuesta recibida:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      console.log('📋 Resultado parseado:', result)
      setLastResult(result)
      
      if (result.success) {
        console.log('✅ Llamada simulada exitosamente:', result.activity_id)
      } else {
        console.error('❌ Error en simulación:', result.error || result.details || 'Error desconocido')
      }
    } catch (error) {
      console.error('❌ Error completo:', error)
      const errorMessage = error instanceof Error ? error.message : 'Error de conexión'
      setLastResult({ 
        success: false, 
        error: errorMessage,
        timestamp: new Date().toISOString()
      })
    } finally {
      setLoading(false)
    }
  }

  const quickTests = [
    {
      name: 'Llamada entrante contestada',
      icon: <PhoneIncoming className="h-4 w-4" />,
      data: { event: 'answered', direction: 'inbound', from: '+1555000001', duration: 65 }
    },
    {
      name: 'Llamada saliente completada', 
      icon: <PhoneOutgoing className="h-4 w-4" />,
      data: { event: 'completed', direction: 'outbound', to: '+1555000002', duration: 120 }
    },
    {
      name: 'Llamada perdida',
      icon: <PhoneMissed className="h-4 w-4" />,
      data: { event: 'no-answer', direction: 'inbound', from: '+1555000003', duration: 0 }
    },
    {
      name: 'Llamada ocupada',
      icon: <Phone className="h-4 w-4" />,
      data: { event: 'busy', direction: 'inbound', from: '+1555000004', duration: 0 }
    }
  ]

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🧪 Panel de Pruebas VOIP
          <Badge variant="secondary">Desarrollo</Badge>
        </CardTitle>
        <CardDescription>
          Simula eventos de llamadas para probar el sistema en tiempo real
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Pruebas rápidas */}
        <div>
          <h3 className="text-sm font-medium mb-3">Pruebas Rápidas</h3>
          <div className="grid grid-cols-2 gap-2">
            {quickTests.map((test, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => {
                  setFormData(prev => ({ ...prev, ...test.data }))
                  setTimeout(() => handleSimulateCall(), 100)
                }}
                disabled={loading}
              >
                {test.icon}
                {test.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Configuración personalizada */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Configuración Personalizada</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Evento</label>
              <Select value={formData.event} onValueChange={(value) => 
                setFormData(prev => ({ ...prev, event: value }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initiated">Iniciada</SelectItem>
                  <SelectItem value="ringing">Sonando</SelectItem>
                  <SelectItem value="answered">Contestada</SelectItem>
                  <SelectItem value="completed">Completada</SelectItem>
                  <SelectItem value="no-answer">No contestada</SelectItem>
                  <SelectItem value="busy">Ocupado</SelectItem>
                  <SelectItem value="failed">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Dirección</label>
              <Select value={formData.direction} onValueChange={(value) => 
                setFormData(prev => ({ ...prev, direction: value as 'inbound' | 'outbound' }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Entrante</SelectItem>
                  <SelectItem value="outbound">Saliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Desde</label>
              <Input
                value={formData.from}
                onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))}
                placeholder="+1234567890"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Hacia</label>
              <Input
                value={formData.to}
                onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
                placeholder="+0987654321"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Duración (seg)</label>
              <Input
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                placeholder="45"
              />
            </div>
          </div>

          <Button 
            onClick={handleSimulateCall} 
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Simulando...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Simular Llamada
              </>
            )}
          </Button>
        </div>

        {/* Resultado de la última prueba */}
        {lastResult && (
          <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-800">
            <h4 className="text-sm font-medium mb-2">Último Resultado:</h4>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          </div>
        )}

        {/* Instrucciones */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>💡 <strong>Tips:</strong></p>
          <p>• Las notificaciones aparecerán en la esquina superior derecha</p>
          <p>• Verifica las actividades creadas en el módulo CRM</p>
          <p>• Abre la consola del navegador para ver logs detallados</p>
        </div>
      </CardContent>
    </Card>
  )
}
