'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useOrganization, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { History, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui/lib-utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';

// Componente Avatar temporal hasta que se cree el componente real
interface AvatarProps {
  className?: string;
  children?: React.ReactNode;
}

const Avatar: React.FC<AvatarProps> = ({ className, children }) => (
  <div className={cn(
    "flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
    className
  )}>
    {children}
  </div>
);

interface AvatarImageProps {
  src?: string; 
  alt?: string;
  className?: string;
}

const AvatarImage: React.FC<AvatarImageProps> = ({ src, alt = "", className }) => {
  const [error, setError] = useState(false);
  
  if (error || !src) return null;
  
  return (
    <img 
      src={src} 
      alt={alt} 
      onError={() => setError(true)}
      className={cn("aspect-square h-full w-full", className)}
    />
  );
};

interface AvatarFallbackProps {
  className?: string;
  children?: React.ReactNode;
}

const AvatarFallback: React.FC<AvatarFallbackProps> = ({ className, children }) => (
  <div className={cn(
    "flex h-full w-full items-center justify-center rounded-full bg-muted",
    className
  )}>
    {children}
  </div>
);

interface AuditoriaTabProps {
  producto: any;
}

interface AuditLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action_type: string; // create, update, delete
  changes: any;
  user_id: string;
  user_name?: string;
  user_avatar?: string | null;
  created_at: string;
}

/**
 * Pestaña para mostrar el historial de cambios del producto
 */
const AuditoriaTab: React.FC<AuditoriaTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const { organization } = useOrganization();
  
  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  
  /**
   * Obtiene el ID de la organización de forma segura, primero del contexto y luego del localStorage
   * @returns El ID de la organización o null si no se encuentra
   */
  const getOrganizationId = (): number | null => {
    // Primero intentamos obtenerlo del contexto
    if (organization?.id) {
      return organization.id;
    }
    
    // Si no está en el contexto, intentamos recuperarlo del localStorage
    try {
      const orgData = obtenerOrganizacionActiva();
      if (orgData && orgData.id) {
        console.log('AuditoriaTab: Usando organización del localStorage:', orgData.id);
        return orgData.id;
      }
    } catch (e) {
      console.error('Error al obtener organización del localStorage:', e);
    }
    
    return null;
  };
  
  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        setLoading(true);
        
        // Obtener el ID de la organización de forma segura
        const orgId = getOrganizationId();
        
        // Verificar si tenemos organización
        if (!orgId) {
          console.warn('No hay organización seleccionada para cargar historial de auditoría');
          setLoading(false);
          return;
        }
        
        // 1. Obtener registros de auditoría para este producto
        const { data: logsData, error: logsError } = await supabase
          .from('products_audit_log')
          .select('*')
          .eq('entity_id', producto.id)
          .eq('entity_type', 'product')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (logsError) throw logsError;
        
        // Si no hay registros, terminamos
        if (!logsData || logsData.length === 0) {
          setLogs([]);
          setLoading(false);
          return;
        }
        
        // 2. Extraer los IDs de usuario únicos de los logs
        const userIds = logsData
          .map(log => log.user_id)
          .filter((id, index, self) => self.indexOf(id) === index);
        
        // 3. Obtener información de los perfiles de usuario
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds);
        
        if (profilesError) throw profilesError;
        
        // 4. Crear un mapa para acceder fácilmente a los datos del perfil por ID
        interface ProfileInfo {
          name: string;
          avatar_url: string | null;
        }
        
        const profilesMap: Record<string, ProfileInfo> = {};
        profilesData?.forEach(profile => {
          profilesMap[profile.id] = {
            name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario',
            avatar_url: profile.avatar_url
          };
        });
        
        // 5. Combinar los datos y formatear para la interfaz
        const formattedLogs: AuditLog[] = logsData.map(log => {
          // Asegurar conversión correcta de tipos
          return {
            id: Number(log.id),
            entity_type: String(log.entity_type),
            entity_id: Number(log.entity_id),
            action_type: String(log.action_type),
            changes: log.changes,
            user_id: String(log.user_id),
            user_name: (profilesMap[log.user_id]?.name) || 'Usuario desconocido',
            user_avatar: profilesMap[log.user_id]?.avatar_url || undefined,
            created_at: String(log.created_at)
          };
        }) || [];
        
        setLogs(formattedLogs);
      } catch (error) {
        console.error('Error al cargar historial de auditoría:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo cargar el historial de auditoría",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchAuditLogs();
  }, [producto.id]); // Eliminamos la dependencia de organization?.id ya que ahora usamos getOrganizationId()
  
  // Formatear fecha
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy, HH:mm', { locale: es });
    } catch (e) {
      return 'Fecha inválida';
    }
  };
  
  // Obtener etiqueta para el tipo de acción
  const getActionBadge = (actionType: string) => {
    switch (actionType) {
      case 'create':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-300">
            Creación
          </Badge>
        );
      case 'update':
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300">
            Actualización
          </Badge>
        );
      case 'delete':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900 dark:text-red-300">
            Eliminación
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300">
            {actionType}
          </Badge>
        );
    }
  };
  
  // Formatear cambios para mostrarlos
  const formatChanges = (changes: any) => {
    if (!changes) return 'No hay detalles';
    
    try {
      // Si es un objeto, mostrar cambios específicos
      if (typeof changes === 'object') {
        const changesArray = [];
        
        // Campos específicos para mostrar con nombres más amigables
        const fieldLabels: Record<string, string> = {
          name: 'Nombre',
          sku: 'SKU',
          barcode: 'Código de barras',
          description: 'Descripción',
          price: 'Precio',
          cost: 'Costo',
          status: 'Estado',
          category_id: 'Categoría',
          unit_id: 'Unidad',
          supplier_id: 'Proveedor',
          track_stock: 'Seguimiento de stock',
        };
        
        if (changes.old && changes.new) {
          // Es una actualización, comparar valores
          for (const key in changes.new) {
            if (key in changes.old && changes.old[key] !== changes.new[key]) {
              const fieldName = fieldLabels[key] || key;
              let oldValue = changes.old[key];
              let newValue = changes.new[key];
              
              // Formatear valores especiales
              if (key === 'price' || key === 'cost') {
                oldValue = oldValue ? `$${parseFloat(oldValue).toFixed(2)}` : '-';
                newValue = newValue ? `$${parseFloat(newValue).toFixed(2)}` : '-';
              } else if (key === 'status') {
                oldValue = oldValue === 'active' ? 'Activo' : 
                          oldValue === 'inactive' ? 'Inactivo' : 
                          oldValue === 'deleted' ? 'Eliminado' : oldValue;
                newValue = newValue === 'active' ? 'Activo' : 
                          newValue === 'inactive' ? 'Inactivo' : 
                          newValue === 'deleted' ? 'Eliminado' : newValue;
              } else if (key === 'track_stock') {
                oldValue = oldValue ? 'Sí' : 'No';
                newValue = newValue ? 'Sí' : 'No';
              }
              
              changesArray.push(`${fieldName}: ${oldValue} → ${newValue}`);
            }
          }
          
          return changesArray.length > 0 
            ? changesArray.join(', ')
            : 'Sin cambios detectados';
        } else if (changes.new) {
          // Es una creación
          return 'Producto creado';
        } else if (changes.old) {
          // Es una eliminación
          return 'Producto eliminado';
        }
      }
      
      // Si es string o no se puede procesar como objeto
      return typeof changes === 'string' ? changes : JSON.stringify(changes);
    } catch (e) {
      console.error('Error al formatear cambios:', e);
      return 'Error al mostrar cambios';
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <h3 className="text-lg font-medium">
          Historial de Cambios ({logs.length})
        </h3>
      </div>
      
      {/* Tabla de logs de auditoría */}
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : logs.length === 0 ? (
        <div className={`p-8 text-center rounded-md border ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          <History className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium">Sin historial</h3>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            No se encontraron registros de auditoría para este producto.
            Los cambios futuros se registrarán aquí.
          </p>
        </div>
      ) : (
        <div className={`border rounded-md ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
          <Table>
            <TableHeader>
              <TableRow className={theme === 'dark' ? 'border-gray-800 hover:bg-gray-900' : ''}>
                <TableHead className="w-[180px]">Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead className="w-[100px]">Acción</TableHead>
                <TableHead>Cambios</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className={theme === 'dark' ? 'border-gray-800 hover:bg-gray-900' : ''}>
                  <TableCell className="font-medium">
                    {formatDate(log.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        {log.user_avatar ? (
                          <AvatarImage src={log.user_avatar} alt={log.user_name} />
                        ) : (
                          <AvatarFallback className={theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}>
                            {log.user_name?.charAt(0) || 'U'}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span>{log.user_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getActionBadge(log.action_type)}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-md truncate" title={formatChanges(log.changes)}>
                      {formatChanges(log.changes)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      
      {/* Información sobre auditoría */}
      <div className={`rounded-md border p-4 ${
        theme === 'dark' 
          ? 'bg-gray-900 border-gray-700 text-gray-300' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <h4 className="text-sm font-medium mb-2">
          <FileText className="h-4 w-4 inline mr-2" />
          Acerca de la Auditoría
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          El historial de auditoría muestra los cambios realizados al producto, incluyendo creaciones, 
          actualizaciones y eliminaciones. Esto ayuda a mantener un registro de todas las modificaciones
          con información de quién las realizó y cuándo ocurrieron.
        </p>
      </div>
    </div>
  );
};

export default AuditoriaTab;
