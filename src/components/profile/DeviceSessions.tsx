'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/config'
import { 
  Card, 
  CardContent, 
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Laptop, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Trash2, 
  Shield, 
  ShieldCheck,
  Globe,
  Info,
  Loader2
} from 'lucide-react'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import toast from 'react-hot-toast'

interface Session {
  id: string
  created_at: string
  updated_at: string
  current: boolean
  device_name: string
  device_type: string
  last_active_at: string
  is_trusted: boolean
  location: string | null
  user_agent: string | null
  ip_address: string | null
}

export function DeviceSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null)
  const [deviceNameDialog, setDeviceNameDialog] = useState(false)
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [newDeviceName, setNewDeviceName] = useState('')
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [renameLoading, setRenameLoading] = useState(false)
  const [trustLoading, setTrustLoading] = useState<string | null>(null)
  
  // Cargar sesiones
  const loadSessions = async () => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'GET',
        credentials: 'include', // Incluir cookies en la petición
        headers: {
          'Content-Type': 'application/json',
        }
      })
      const data = await response.json()
      
      if (data.error) {
        toast.error(data.error)
        return
      }
      
      // Ordenar sesiones (sesión actual primero, luego por última actividad)
      const sortedSessions = [...data.sessions].sort((a, b) => {
        if (a.current) return -1
        if (b.current) return 1
        return new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()
      })
      
      setSessions(sortedSessions)
    } catch (error) {
      toast.error('No se pudieron cargar las sesiones')
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    loadSessions()
  }, [])
  
  // Revocar una sesión
  const revokeSession = async () => {
    if (!sessionToRevoke) return
    
    setRevokeLoading(true)
    try {
      const response = await fetch(`/api/sessions`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: sessionToRevoke })
      })
      
      const data = await response.json()
      
      if (data.error) {
        toast.error(data.error)
        return
      }
      
      toast.success(data.message || 'Dispositivo desconectado')
      
      // Recargar la lista de sesiones
      loadSessions()
    } catch (error) {
      toast.error('No se pudo desconectar el dispositivo')
    } finally {
      setRevokeLoading(false)
      setConfirmDialog(false)
      setSessionToRevoke(null)
    }
  }
  
  // Cambiar nombre de dispositivo
  const renameDevice = async () => {
    if (!activeSession || !newDeviceName.trim()) return
    
    setRenameLoading(true)
    try {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          sessionId: activeSession.id,
          updates: { device_name: newDeviceName.trim() }
        }),
      })
      
      const data = await response.json()
      
      if (data.error) {
        toast.error(data.error)
        return
      }
      
      toast.success('Dispositivo renombrado')
      
      // Recargar la lista de sesiones
      loadSessions()
    } catch (error) {
      toast.error('No se pudo actualizar el nombre del dispositivo')
    } finally {
      setRenameLoading(false)
      setDeviceNameDialog(false)
      setActiveSession(null)
      setNewDeviceName('')
    }
  }
  
  // Marcar dispositivo como confiable
  const toggleTrustedDevice = async (sessionId: string, isTrusted: boolean) => {
    setTrustLoading(sessionId)
    try {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          updates: { is_trusted: !isTrusted }
        }),
      })
      
      const data = await response.json()
      
      if (data.error) {
        toast.error(data.error)
        return
      }
      
      toast.success(!isTrusted ? 'Dispositivo confiable' : 'Dispositivo estándar')
      
      // Recargar la lista de sesiones
      loadSessions()
    } catch (error) {
      toast.error('No se pudo actualizar el estado del dispositivo')
    } finally {
      setTrustLoading(null)
    }
  }
  
  // Cerrar todas las demás sesiones
  const signOutFromOtherSessions = async () => {
    try {
      const response = await fetch(`/api/sessions`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ revokeAll: true })
      })
      
      const data = await response.json()
      
      if (data.error) {
        toast.error(data.error)
        return
      }
      
      toast.success('Todos los otros dispositivos han sido desconectados')
      
      // Recargar la lista de sesiones
      loadSessions()
    } catch (error) {
      toast.error('No se pudieron desconectar los otros dispositivos')
    }
  }
  
  // Función para determinar el icono del dispositivo
  const getDeviceIcon = (deviceType: string) => {
    switch(deviceType?.toLowerCase()) {
      case 'android':
      case 'ios':
      case 'windows phone':
        return <Smartphone className="h-5 w-5" />
      case 'tablet':
        return <Tablet className="h-5 w-5" />
      case 'windows':
      case 'mac':
      case 'linux':
        return <Laptop className="h-5 w-5" />
      case 'desktop':
        return <Monitor className="h-5 w-5" />
      default:
        return <Globe className="h-5 w-5" />
    }
  }
  
  // Formatear fechas
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    
    // Si es hoy, mostrar solo la hora
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return `Hoy, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    
    // Si es ayer, mostrar "Ayer"
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return `Ayer, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    
    // Si es en la última semana, mostrar el día
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    if (date > lastWeek) {
      return date.toLocaleDateString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    }
    
    // Para fechas más antiguas, mostrar la fecha completa
    return date.toLocaleDateString([], { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  // Obtener la ubicación aproximada
  const getLocationText = (session: Session) => {
    if (session.location) {
      return session.location
    }
    
    if (session.ip_address) {
      return `IP: ${session.ip_address}`
    }
    
    return 'Ubicación desconocida'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" /> 
          Sesiones de dispositivos
        </CardTitle>
        <CardDescription>
          Gestiona los dispositivos desde los cuales has iniciado sesión en tu cuenta
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No hay sesiones activas</AlertTitle>
                <AlertDescription>
                  No se encontraron sesiones activas para tu cuenta
                </AlertDescription>
              </Alert>
            ) : (
              sessions.map((session) => (
                <div 
                  key={session.id} 
                  className={`flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg
                    ${session.current ? 'bg-muted/30' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`rounded-full p-2 ${session.is_trusted ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                      {getDeviceIcon(session.device_type)}
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{session.device_name}</h4>
                        {session.current && (
                          <Badge variant="outline" className="text-xs">
                            Actual
                          </Badge>
                        )}
                        {session.is_trusted && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200 text-xs">
                            <ShieldCheck className="h-3 w-3 mr-1" /> Confiable
                          </Badge>
                        )}
                      </div>
                      
                      <div className="text-sm text-muted-foreground mt-1">
                        {session.device_type} • {getLocationText(session)}
                      </div>
                      
                      <div className="text-sm text-muted-foreground mt-1">
                        Última actividad: {formatDate(session.last_active_at)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex mt-3 md:mt-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setActiveSession(session)
                        setNewDeviceName(session.device_name)
                        setDeviceNameDialog(true)
                      }}
                    >
                      Renombrar
                    </Button>
                    
                    <Button
                      variant={session.is_trusted ? "outline" : "secondary"}
                      size="sm"
                      className="text-xs"
                      disabled={trustLoading === session.id}
                      onClick={() => toggleTrustedDevice(session.id, session.is_trusted)}
                    >
                      {trustLoading === session.id ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Shield className="h-3 w-3 mr-1" />
                      )}
                      {session.is_trusted ? 'Quitar confianza' : 'Confiar'}
                    </Button>
                    
                    {!session.current && (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setSessionToRevoke(session.id)
                          setConfirmDialog(true)
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Desconectar
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
            
            {sessions.length > 1 && (
              <Alert className="bg-amber-50 border-amber-200 text-amber-800 mt-6">
                <Info className="h-4 w-4 text-amber-800" />
                <AlertTitle>Múltiples sesiones activas</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <p>
                    Tienes {sessions.length} sesiones activas en distintos dispositivos. 
                    Por seguridad, considera desconectar los dispositivos que no estés utilizando.
                  </p>
                  <div className="flex flex-col md:flex-row gap-2">
                    <Button 
                      onClick={signOutFromOtherSessions} 
                      variant="outline" 
                      className="border-amber-300 hover:bg-amber-100 hover:text-amber-900 w-full md:w-auto"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Desconectar todos los otros dispositivos
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
      
      {/* Diálogo de confirmación para revocación */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desconectar dispositivo</DialogTitle>
            <DialogDescription>
              ¿Estás seguro que deseas desconectar este dispositivo? Perderá acceso 
              inmediatamente y deberá iniciar sesión nuevamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialog(false)} 
              disabled={revokeLoading}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive"
              onClick={revokeSession}
              disabled={revokeLoading}
            >
              {revokeLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Desconectando...
                </>
              ) : (
                'Desconectar dispositivo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Diálogo para cambiar nombre del dispositivo */}
      <Dialog open={deviceNameDialog} onOpenChange={setDeviceNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar dispositivo</DialogTitle>
            <DialogDescription>
              Asigna un nombre personalizado para identificar más fácilmente este dispositivo.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="device-name">Nombre del dispositivo</Label>
            <Input 
              id="device-name" 
              value={newDeviceName} 
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="Ej: Mi laptop personal"
              className="mt-1"
              autoFocus
            />
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeviceNameDialog(false)}
              disabled={renameLoading}
            >
              Cancelar
            </Button>
            <Button 
              onClick={renameDevice}
              disabled={!newDeviceName.trim() || renameLoading}
            >
              {renameLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
