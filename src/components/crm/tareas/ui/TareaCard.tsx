'use client';

import React, { useState, useEffect } from 'react';
import { Task, TaskType, TaskPriority, TaskPriorityUI, TaskStatus, TaskStatusUI } from '@/types/task';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CalendarIcon, CheckCircleIcon, ClockIcon, PhoneIcon, VideoIcon, MailIcon, 
  UserIcon, MoreVertical, Edit, Check, ChevronRight, UserCircle2,
  UserIcon as User, Clock as Clock8, Play, CheckCircle2, XCircle, Eye,
  FileIcon
} from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { formatDate } from '@/utils/Utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Props para el componente TareaCard
interface TareaCardProps {
  tarea: Task;
  onStatusChange?: (id: string, status: TaskStatus) => void;
  onEdit?: (tarea: Task) => void;
  onViewDetails?: (tarea: Task) => void;
  draggable?: boolean;
}

// Mapeo de íconos según tipo de tarea
const iconosPorTipo: Record<Exclude<TaskType, null>, React.ReactNode> = {
  llamada: <PhoneIcon className="h-4 w-4 mr-1" />,
  reunion: <VideoIcon className="h-4 w-4 mr-1" />,
  email: <MailIcon className="h-4 w-4 mr-1" />,
  visita: <UserIcon className="h-4 w-4 mr-1" />,
};

// Mapeo de nombres de tipos para UI
const nombresPorTipo: Record<Exclude<TaskType, null>, string> = {
  llamada: 'Llamada',
  reunion: 'Reunión',
  email: 'Email',
  visita: 'Visita',
};

// Función para mapear valores de BD a valores en español para la UI
const mapDbValueToUIPriority = (priority: TaskPriority): TaskPriorityUI => {
  switch(priority) {
    case 'low': return 'baja';
    case 'med': return 'media';
    case 'high': return 'alta'; // Por defecto 'alta' para 'high'
    default: return 'baja';
  }
};

// Función para formatear textos para visualización (capitaliza y reemplaza guiones bajos por espacios)
const formatearTextoParaUI = (texto: string | null | undefined): string => {
  // Si el texto es nulo o indefinido, devolver cadena vacía
  if (texto === null || texto === undefined) {
    return '';
  }
  // Si la cadena está vacía, devolver cadena vacía
  if (texto.length === 0) {
    return '';
  }
  
  // Reemplazar guiones bajos por espacios
  const textoConEspacios = texto.replace(/_/g, ' ');
  
  // Capitalizar cada palabra
  return textoConEspacios
    .split(' ')
    .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ');
};

// Función original para capitalizar solo la primera letra (mantenida para compatibilidad)
const capitalizarPrimeraLetra = (texto: string | null | undefined): string => {
  // Si el texto es nulo o indefinido, devolver cadena vacía
  if (texto === null || texto === undefined) {
    return '';
  }
  // Si la cadena está vacía, devolver cadena vacía
  if (texto.length === 0) {
    return '';
  }
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// Función para mapear estado en español a valores aceptados por la BD
const mapStatusToDbValue = (status: TaskStatusUI): TaskStatus => {
  switch(status) {
    case 'pendiente': return 'open';
    case 'en_progreso': return 'in_progress';
    case 'completada': return 'done';
    case 'cancelada': return 'canceled';
    default: return 'open'; // Valor por defecto
  }
};

// Función para mapear valores de BD a valores en español para la UI
const mapDbValueToUIStatus = (status: TaskStatus): TaskStatusUI => {
  switch(status) {
    case 'open': return 'pendiente';
    case 'in_progress': return 'en_progreso';
    case 'done': return 'completada';
    case 'canceled': return 'cancelada';
    default: return 'pendiente';
  }
};

// Mapeo de colores según prioridad UI
const colorPorPrioridad: Record<TaskPriorityUI, string> = {
  baja: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  media: 'bg-blue-200 text-blue-700 dark:bg-blue-800 dark:text-blue-200',
  alta: 'bg-orange-200 text-orange-700 dark:bg-orange-800 dark:text-orange-200',
  urgente: 'bg-red-200 text-red-700 dark:bg-red-800 dark:text-red-200',
};

// Mapeo de colores según estado (UI)
const colorPorEstado: Record<TaskStatusUI, string> = {
  pendiente: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  en_progreso: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  completada: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelada: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

/**
 * Componente para mostrar una tarea individual en forma de tarjeta
 */
const TareaCard: React.FC<TareaCardProps> = ({ tarea, onStatusChange, onEdit, onViewDetails, draggable = false }) => {
  // Función para manejar el cambio de estado
  const handleStatusChange = (statusUI: TaskStatusUI) => {
    if (onStatusChange) {
      // Mapear de UI a BD antes de enviar
      const statusDB = mapStatusToDbValue(statusUI);
      onStatusChange(tarea.id, statusDB);
    }
  };

  // Estado para almacenar las iniciales del usuario y su nombre completo
  const [inicialesUsuario, setInicialesUsuario] = useState<string>('US');
  const [nombreCompletoUsuario, setNombreCompletoUsuario] = useState<string>('');
  
  // Función para obtener los datos del usuario asignado
  const obtenerDatosUsuario = async () => {
    if (!tarea.assigned_to) return;
    
    try {
      const supabase = createClientComponentClient();
      const { data, error } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', tarea.assigned_to)
        .single();
      
      if (error || !data?.name) {
        console.error('Error al obtener el nombre del usuario:', error);
        return;
      }
      
      // Si tenemos un nombre, guardamos el nombre completo y extraemos las iniciales
      const nombreCompleto = data.name;
      setNombreCompletoUsuario(nombreCompleto);
      
      const iniciales = nombreCompleto
        .split(' ')
        .map((palabra: string) => palabra[0]?.toUpperCase() || '')
        .slice(0, 2) // Tomamos solo las dos primeras iniciales
        .join('');
      
      setInicialesUsuario(iniciales || 'US');
    } catch (error) {
      console.error('Error inesperado:', error);
    }
  };
  
  // Obtener los datos del usuario al cargar el componente
  useEffect(() => {
    if (tarea.assigned_to) {
      obtenerDatosUsuario();
    }
  }, [tarea.assigned_to]);

  return (
    <TooltipProvider>
      <Card 
        className="w-full mb-2 hover:shadow-md transition-all duration-200 border-l-4 rounded-lg overflow-hidden bg-white dark:bg-slate-800 hover:scale-[1.02] border-0" 
        style={{
          borderLeftColor: mapDbValueToUIPriority(tarea.priority) === 'urgente' ? 'var(--red-500)' : 
                           mapDbValueToUIPriority(tarea.priority) === 'alta' ? 'var(--orange-400)' : 
                           mapDbValueToUIPriority(tarea.priority) === 'media' ? 'var(--blue-400)' : 'var(--slate-400)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
        }}
        draggable={draggable}
        id={`tarea-${tarea.id}`}
        data-task-id={tarea.id}
      >
        <CardHeader className="py-3 px-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-750">
          <div className="flex justify-between items-start">
            <div className="flex-1 mr-2">
              <CardTitle className="text-base font-medium text-slate-800 dark:text-slate-100 break-words">
                {tarea.title.length > 60 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="line-clamp-2">{tarea.title}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs whitespace-normal">
                      <p>{tarea.title}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : tarea.title}
              </CardTitle>
            </div>
            
            <div className="flex items-center space-x-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={`${colorPorPrioridad[mapDbValueToUIPriority(tarea.priority)]} rounded-full px-2 py-0.5 text-xs font-medium`}>
                    {capitalizarPrimeraLetra(mapDbValueToUIPriority(tarea.priority)).substring(0, 1)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Prioridad: {capitalizarPrimeraLetra(mapDbValueToUIPriority(tarea.priority))}</p>
                </TooltipContent>
              </Tooltip>
              
              {(onEdit || onStatusChange) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[160px]">
                    {onViewDetails && (
                      <DropdownMenuItem onClick={() => onViewDetails(tarea)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalles
                      </DropdownMenuItem>
                    )}
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(tarea)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                    )}
                    {onStatusChange && mapDbValueToUIStatus(tarea.status) !== 'completada' && mapDbValueToUIStatus(tarea.status) !== 'cancelada' && (
                      <DropdownMenuItem onClick={() => handleStatusChange('completada' as TaskStatusUI)}>
                        <Check className="h-4 w-4 mr-2" />
                        Completar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="py-3 px-4">
          {tarea.description && (
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-md p-2 mb-3">
              {tarea.description.length > 100 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 break-words">{tarea.description}</p>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs whitespace-normal">
                    <p className="text-sm">{tarea.description}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300 break-words">{tarea.description}</p>
              )}
            </div>
          )}
          
          <div className="flex flex-col gap-2 mb-2">
            <Badge variant="outline" className={`flex items-center px-3 py-1 rounded-full whitespace-nowrap self-start ${colorPorEstado[mapDbValueToUIStatus(tarea.status)]}`}>
              <div className="flex items-center">
                {mapDbValueToUIStatus(tarea.status) === 'pendiente' && <Clock8 className="h-3 w-3 mr-1 text-blue-500" />}
                {mapDbValueToUIStatus(tarea.status) === 'en_progreso' && <Play className="h-3 w-3 mr-1 text-yellow-500" />}
                {mapDbValueToUIStatus(tarea.status) === 'completada' && <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />}
                {mapDbValueToUIStatus(tarea.status) === 'cancelada' && <XCircle className="h-3 w-3 mr-1 text-red-500" />}
                <span className="font-medium">{formatearTextoParaUI(mapDbValueToUIStatus(tarea.status))}</span>
              </div>
            </Badge>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="flex items-center px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 whitespace-nowrap self-start">
                  {tarea.type ? iconosPorTipo[tarea.type] : <FileIcon className="h-4 w-4 mr-1" />}
                  <span className="ml-1">{tarea.type ? nombresPorTipo[tarea.type] : 'Tarea'}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tipo: {tarea.type ? nombresPorTipo[tarea.type] : 'Tarea'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
        
        <CardFooter className="pt-2 pb-3 px-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800/80 px-2 py-1 rounded-md shadow-sm max-w-[65%] truncate">
            <CalendarIcon className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
            {formatDate(new Date(tarea.due_date))}
            {tarea.start_time && (
              <span className="ml-2 flex items-center">
                <ClockIcon className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
                {new Date(tarea.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          
          {tarea.assigned_to && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center bg-white dark:bg-slate-800/80 px-2 py-1 rounded-md shadow-sm hover:bg-slate-50 transition-colors">
                  <User className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
                  <Avatar className="h-6 w-6 bg-primary/10 border-2 border-white dark:border-slate-700 hover:scale-110 transition-transform">
                    <AvatarFallback className="text-xs font-medium">
                      {inicialesUsuario}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Asignado a: {nombreCompletoUsuario || `Usuario ${inicialesUsuario}`}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
};

export default TareaCard;
