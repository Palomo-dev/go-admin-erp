'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Task, TaskPriority, TaskStatus } from '@/types/task';
// Importamos solo lo que necesitamos
// Nota: No importamos formatDate porque usamos nuestra propia función formatearFecha
import { 
  CalendarIcon, 
  Building2Icon, 
  UserIcon, 
  TargetIcon, 
  PhoneIcon, 
  Clock as ClockIcon,
  CheckCircle as CheckCircleIcon,
  XCircle as XCircleIcon,
  PlayCircle as PlayCircleIcon,
  InfoIcon,
  ExternalLink
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Separator } from '@/components/ui/separator';

/**
 * Props para el componente DetallesTareaModal
 * @interface DetallesTareaModalProps
 * @property {Task | null} tarea - La tarea a mostrar en detalle
 * @property {boolean} abierto - Indica si el modal está abierto
 * @property {Function} onClose - Función para cerrar el modal
 */
interface DetallesTareaModalProps {
  tarea: Task | null;
  abierto: boolean;
  onClose: () => void;
}

interface ClienteInfo {
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
}

interface OportunidadInfo {
  name?: string;
  value?: number;
  client_name?: string;
  status?: string;
  closing_date?: string;
  type?: string; // Tipo de oportunidad
}

// Mapeo de íconos según tipo de tarea
const iconosPorTipo: Record<string, React.ReactNode> = {
  llamada: <PhoneIcon className="h-4 w-4 mr-1" />,
  reunion: <TargetIcon className="h-4 w-4 mr-1" />,
  email: <ExternalLink className="h-4 w-4 mr-1" />,
  visita: <UserIcon className="h-4 w-4 mr-1" />,
};

// Mapeo de íconos según estado
const iconosPorEstado: Record<string, React.ReactNode> = {
  open: <ClockIcon className="h-4 w-4 mr-1" />,
  in_progress: <PlayCircleIcon className="h-4 w-4 mr-1" />,
  done: <CheckCircleIcon className="h-4 w-4 mr-1" />,
  canceled: <XCircleIcon className="h-4 w-4 mr-1" />,
};

// Colores para las prioridades
const colorPorPrioridad: Record<string, string> = {
  low: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  med: 'bg-blue-200 text-blue-700 dark:bg-blue-800 dark:text-blue-200',
  high: 'bg-orange-200 text-orange-700 dark:bg-orange-800 dark:text-orange-200',
};

// Mapeo de valores de BD a valores en español para la UI
const traducirPrioridad = (prioridad: string): string => {
  switch(prioridad) {
    case 'low': return 'Baja';
    case 'med': return 'Media';
    case 'high': return 'Alta';
    default: return prioridad;
  }
};

// Mapeo de valores de BD a valores en español para la UI
const traducirEstado = (estado: string): string => {
  switch(estado) {
    case 'open': return 'Pendiente';
    case 'in_progress': return 'En progreso';
    case 'done': return 'Completada';
    case 'canceled': return 'Cancelada';
    default: return estado;
  }
};

// Función para capitalizar texto
const capitalizarPrimeraLetra = (texto: string | null | undefined): string => {
  if (!texto) return '';
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// Función para formatear fechas de manera segura
const formatearFecha = (date: Date | null | undefined): string => {
  if (!date || isNaN(date.getTime())) return 'Fecha no disponible';
  
  try {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error al formatear fecha:', error);
    return 'Error de formato';
  }
};

/**
 * Componente para mostrar los detalles de una tarea en un modal
 * @param {DetallesTareaModalProps} props - Propiedades del componente
 * @returns {JSX.Element | null} Componente React
 */
const DetallesTareaModal = ({ tarea, abierto, onClose }: DetallesTareaModalProps) => {
  const [usuarioNombre, setUsuarioNombre] = useState<string>("");
  const [clienteInfo, setClienteInfo] = useState<string>("");
  const [relacionDetalle, setRelacionDetalle] = useState<ClienteInfo | OportunidadInfo | null>(null);
  const supabase = createClientComponentClient();

  // Cargar información adicional como nombre de usuario asignado y cliente
  useEffect(() => {
    const cargarDatosAdicionales = async () => {
      if (tarea && abierto) {
        console.log("Datos de tarea:", { 
          id: tarea.id,
          assigned_to: tarea.assigned_to, 
          related_to_type: tarea.related_to_type, 
          related_to_id: tarea.related_to_id 
        });
        
        // Limpiar valores previos al abrir el modal
        setUsuarioNombre("");
        setClienteInfo("");
        setRelacionDetalle(null);
        
        // Cargar nombre de usuario si hay uno asignado
        if (tarea.assigned_to) {
          try {
            console.log("Cargando información de usuario ID:", tarea.assigned_to);
            
            // Intentamos obtener el nombre ya sea de la propiedad asignada o cargando de la BD
            if (tarea.assigned_to_name) {
              console.log("Usando nombre asignado ya presente en la tarea:", tarea.assigned_to_name);
              setUsuarioNombre(tarea.assigned_to_name);
            } else {
              // Primero buscamos en profiles (tabla principal de usuarios)
              const { data, error } = await supabase
                .from('profiles')
                .select('first_name, last_name, email')
                .eq('id', tarea.assigned_to)
                .single();
                
              if (data && !error) {
                console.log("Datos de usuario encontrados en profiles:", data);
                // Construir nombre completo a partir de first_name y last_name
                const nombreCompleto = data.first_name && data.last_name 
                  ? `${data.first_name} ${data.last_name}` 
                  : data.first_name || data.last_name || data.email || "Usuario sin nombre";
                setUsuarioNombre(nombreCompleto);
              } else {
                console.warn("No se encontró el usuario en profiles, buscando en user_display_info:", error);
                // Intentar buscar en la tabla user_display_info como alternativa
                const { data: userData, error: userError } = await supabase
                  .from('user_display_info')
                  .select('display_name, email')
                  .eq('user_id', tarea.assigned_to)
                  .single();
                  
                if (userData && !userError) {
                  console.log("Datos de usuario encontrados en user_display_info:", userData);
                  setUsuarioNombre(userData.display_name || userData.email || "Usuario");
                } else {
                  console.warn("Usuario no encontrado en user_display_info, usando ID como fallback");
                  setUsuarioNombre(`Usuario (${tarea.assigned_to.substring(0, 8)})`);
                }
              }
            }
          } catch (error) {
            console.error("Error al cargar nombre de usuario:", error);
            setUsuarioNombre("Error al cargar usuario");
          }
        } else {
          console.log("Tarea sin usuario asignado");
          setUsuarioNombre("No asignado");
        }

        // Cargar información del cliente usando los datos ya disponibles
        console.log('🔍 Depurando datos de cliente en tarea:', {
          customer_id: tarea.customer_id,
          customer: tarea.customer,
          related_to_type: tarea.related_to_type,
          related_to_id: tarea.related_to_id,
          title: tarea.title
        });
        
        // Priorizar la información del cliente del campo customer si está disponible
        if (tarea.customer_id && tarea.customer) {
          // Usar los datos del cliente obtenidos del JOIN
          console.log('✅ Usando datos del cliente del campo customer:', tarea.customer);
          
          const nombreCliente = tarea.customer.full_name || 
            (tarea.customer.first_name && tarea.customer.last_name ? 
              `${tarea.customer.first_name} ${tarea.customer.last_name}` : 
              tarea.customer.first_name || tarea.customer.last_name || 'Cliente sin nombre');
          
          setClienteInfo(nombreCliente);
          setRelacionDetalle({
            company_name: nombreCliente,
            contact_name: `${tarea.customer.first_name || ''} ${tarea.customer.last_name || ''}`.trim() || nombreCliente,
            email: tarea.customer.email || undefined,
            phone: tarea.customer.phone || undefined
          });
        } else if (tarea.customer_id && !tarea.customer) {
          // Si hay customer_id pero no customer, intentar cargar desde la BD
          console.log('🔄 Cargando información del cliente desde BD, ID:', tarea.customer_id);
          
          try {
            const { data: clienteData, error: errorCliente } = await supabase
              .from('customers')
              .select('full_name, email, phone, first_name, last_name')
              .eq('id', tarea.customer_id)
              .single();
            
            if (clienteData && !errorCliente) {
              const nombreCliente = clienteData.full_name || 
                (clienteData.first_name && clienteData.last_name ? 
                  `${clienteData.first_name} ${clienteData.last_name}` : 
                  clienteData.first_name || clienteData.last_name || 'Cliente sin nombre');
              
              setClienteInfo(nombreCliente);
              setRelacionDetalle({
                company_name: nombreCliente,
                contact_name: `${clienteData.first_name || ''} ${clienteData.last_name || ''}`.trim() || nombreCliente,
                email: clienteData.email || undefined,
                phone: clienteData.phone || undefined
              });
            } else {
              console.warn('No se encontró el cliente o hubo error:', errorCliente);
              setClienteInfo('Cliente no disponible');
              setRelacionDetalle(null);
            }
          } catch (error) {
            console.error('Error al cargar cliente desde BD:', error);
            setClienteInfo('Error al cargar cliente');
            setRelacionDetalle(null);
          }
        } else if (tarea.related_to_type && !tarea.related_to_id && !tarea.customer_id) {
          // Caso especial: tipo definido pero sin ID específico
          console.log(`Tarea marcada como ${tarea.related_to_type} pero sin ID específico`);
          setClienteInfo('Sin cliente específico asignado');
          setRelacionDetalle(null);
        } else if (tarea.related_to_type && tarea.related_to_id && !tarea.customer_id) {
          // Fallback: usar la lógica anterior solo si no hay customer_id
          console.log(`Cargando información de ${tarea.related_to_type} ID:`, tarea.related_to_id);
          
          try {
            if (tarea.related_to_type === 'cliente' || tarea.related_to_type === 'client' || tarea.related_to_type === 'customer') {
              const { data, error } = await supabase
                .from('customers')
                .select('full_name, email, phone, first_name, last_name')
                .eq('id', tarea.related_to_id)
                .single();
              
              if (data && !error) {
                const nombreCliente = data.full_name || 
                  (data.first_name && data.last_name ? `${data.first_name} ${data.last_name}` : 
                   data.first_name || data.last_name || 'Cliente sin nombre');
                
                setClienteInfo(nombreCliente);
                setRelacionDetalle({
                  company_name: nombreCliente,
                  contact_name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || nombreCliente,
                  email: data.email,
                  phone: data.phone
                });
              } else {
                console.warn("No se encontró el cliente o hubo error:", error);
                setClienteInfo('Cliente no disponible');
                setRelacionDetalle(null);
              }
            } else if (tarea.related_to_type === 'opportunity') {
              const { data, error } = await supabase
                .from('opportunities')
                .select(`
                  name, value, status, closing_date, type,
                  clients(company_name)
                `)
                .eq('id', tarea.related_to_id)
                .single();
                
              console.log("Respuesta de consulta opportunity:", { data, error });
                
              if (data && !error) {
                const tipoOportunidad = data.type ? ` (${capitalizarPrimeraLetra(data.type)})` : '';
                const nombreOportunidad = `${data.name || ""}${tipoOportunidad}`;
                tarea.related_entity_name = nombreOportunidad;
                setClienteInfo(nombreOportunidad);
                
                let nombreCliente = undefined;
                if (data.clients !== null && data.clients !== undefined) {
                  if (Array.isArray(data.clients) && data.clients.length > 0) {
                    nombreCliente = data.clients[0]?.company_name;
                  } else if (typeof data.clients === 'object') {
                    // @ts-ignore
                    nombreCliente = data.clients.company_name;
                  }
                }
                
                const oportunidadInfo: OportunidadInfo = {
                  name: data.name,
                  value: data.value,
                  status: data.status,
                  closing_date: data.closing_date,
                  client_name: nombreCliente,
                  type: data.type
                };
                
                setRelacionDetalle(oportunidadInfo);
              } else {
                console.warn("No se encontró la oportunidad o hubo error:", error);
                setClienteInfo('Oportunidad no disponible');
              }
            }
          } catch (error) {
            console.error(`Error al cargar información de relación:`, error);
            setClienteInfo(`Error al cargar ${tarea.related_to_type}`);
          }
        } else {
          console.log("Tarea sin relación definida");
        }
      }
    };

    cargarDatosAdicionales();
  }, [tarea, abierto, supabase]);

  // Si no hay tarea seleccionada, no renderizar nada
  if (!tarea) return null;

  return (
    <Dialog
      open={abierto} 
      onOpenChange={(open) => {
        if (open === false) {
          onClose();
        }
      }}
      modal={true}
    >
      <DialogContent 
        className="max-w-md sm:max-w-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="pb-3">
          <div className="flex items-center gap-2">
            {tarea.type && iconosPorTipo[tarea.type] ? iconosPorTipo[tarea.type] : <ClockIcon className="h-4 w-4 mr-1 text-gray-500 dark:text-gray-400" />}
            <DialogTitle className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">{tarea.title}</DialogTitle>
          </div>
          
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className={`flex items-center gap-1 text-xs ${colorPorPrioridad[tarea.priority]}`}>
              {traducirPrioridad(tarea.priority)}
            </Badge>
            
            <Badge variant={tarea.status === 'done' ? 'success' : tarea.status === 'canceled' ? 'destructive' : 'secondary'} 
              className="flex items-center gap-1 text-xs">
              {iconosPorEstado[tarea.status]}
              {traducirEstado(tarea.status)}
            </Badge>
            
            {tarea.type && (
              <Badge variant="outline" className="flex items-center gap-1 text-xs border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                {capitalizarPrimeraLetra(tarea.type)}
              </Badge>
            )}
          </div>
        </DialogHeader>
        
        <div className="space-y-3 sm:space-y-4">
          {tarea.description && (
            <div className="mt-2">
              <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Descripción:</h4>
              <p className="text-sm text-gray-900 dark:text-gray-100">{tarea.description}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tarea.due_date && (
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-900 dark:text-gray-100">Fecha límite: {formatearFecha(tarea.due_date ? new Date(tarea.due_date) : null)}</span>
              </div>
            )}
            
            {/* Siempre mostrar la información del usuario asignado */}
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-900 dark:text-gray-100">Asignada a: {usuarioNombre || (tarea.assigned_to ? 'Cargando...' : 'No asignado')}</span>
            </div>
            
            {/* Mostrar información de relación si existe */}
            {tarea.related_to_type && (
              <div className="flex items-center gap-2">
                {tarea.related_to_type === 'client' || tarea.related_to_type === 'customer' ? 
                  <Building2Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" /> : 
                  <TargetIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                }
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  <span className="font-semibold">
                    {tarea.related_to_type === 'client' || tarea.related_to_type === 'customer' || tarea.related_to_type === 'cliente' ? 'Cliente: ' : 
                     tarea.related_to_type === 'opportunity' ? 'Oportunidad: ' : 
                     tarea.related_to_type ? `${capitalizarPrimeraLetra(tarea.related_to_type)}: ` :
                     'Relacionado con: '}
                  </span>
                  {clienteInfo || 'Cargando información...'}
                </span>
              </div>
            )}
          
          {/* Detalles adicionales de la relación */}
          {relacionDetalle && (
            <div className="mt-4 space-y-3">
              <Separator className="bg-gray-200 dark:bg-gray-700" />
              <h4 className="text-sm font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <InfoIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                {(tarea.related_to_type === 'client' || tarea.related_to_type === 'customer' || tarea.related_to_type === 'cliente') ? 'Detalles del Cliente' : 'Detalles de la Oportunidad'}
              </h4>
              
              {(tarea.related_to_type === 'client' || tarea.related_to_type === 'customer' || tarea.related_to_type === 'cliente') && 'contact_name' in relacionDetalle && (
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {relacionDetalle && 'contact_name' in relacionDetalle && relacionDetalle.contact_name && (
                    <div>
                      <span className="font-medium">Contacto:</span> {relacionDetalle.contact_name}
                    </div>
                  )}
                  {relacionDetalle && 'email' in relacionDetalle && relacionDetalle.email && (
                    <div>
                      <span className="font-medium">Email:</span> {relacionDetalle.email}
                    </div>
                  )}
                  {relacionDetalle && 'phone' in relacionDetalle && relacionDetalle.phone && (
                    <div>
                      <span className="font-medium">Teléfono:</span> {relacionDetalle.phone}
                    </div>
                  )}
                </div>
              )}
              
              {tarea.related_to_type === 'opportunity' && 'value' in relacionDetalle && (
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {relacionDetalle.client_name && (
                    <div className="flex items-center gap-1">
                      <Building2Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">Cliente asociado:</span> {relacionDetalle.client_name}
                    </div>
                  )}
                  {relacionDetalle.type && (
                    <div>
                      <span className="font-medium">Tipo:</span> {capitalizarPrimeraLetra(relacionDetalle.type)}
                    </div>
                  )}
                  {relacionDetalle.value !== undefined && relacionDetalle.value !== null && (
                    <div>
                      <span className="font-medium">Valor:</span> ${relacionDetalle.value?.toLocaleString('es-MX')}
                    </div>
                  )}
                  {relacionDetalle.status && (
                    <div>
                      <span className="font-medium">Estado:</span> {capitalizarPrimeraLetra(relacionDetalle.status)}
                    </div>
                  )}
                  {relacionDetalle.closing_date && (
                    <div>
                      <span className="font-medium">Fecha estimada de cierre:</span> {formatearFecha(relacionDetalle.closing_date ? new Date(relacionDetalle.closing_date) : null)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
          
          {tarea.status === 'canceled' && tarea.cancellation_reason && (
            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Motivo de cancelación:</h4>
              <p className="text-sm text-red-900 dark:text-red-200">{tarea.cancellation_reason}</p>
            </div>
          )}
        </div>
        
        <DialogFooter className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={onClose} className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white">Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DetallesTareaModal;
