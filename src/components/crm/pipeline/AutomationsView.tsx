"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, 
  Bell, 
  CheckSquare, 
  MessageSquare,
  CalendarClock,
  AlertCircle
} from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface AutomationsViewProps {
  pipelineId: string;
}

interface AutomationSettings {
  id?: string;
  taskCreation: boolean;
  notifications: boolean;
  statusUpdate: boolean;
  activityLog: boolean;
  reminders: boolean;
  name?: string;
  description?: string;
  active?: boolean;
  trigger_json?: any;
  actions_json?: any;
}

const AutomationsView: React.FC<AutomationsViewProps> = ({ pipelineId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [automationSettings, setAutomationSettings] = useState<AutomationSettings>({
    taskCreation: true,
    notifications: true,
    statusUpdate: true,
    activityLog: true,
    reminders: false
  });

  // Obtener el ID de la organización de localStorage o sessionStorage
  useEffect(() => {
    // Lista de posibles claves donde podría estar almacenado el ID de la organización
    const possibleKeys = [
      "currentOrganizationId",
      "organizationId", 
      "selectedOrganizationId",
      "orgId",
      "organization_id"
    ];
    
    // Buscar en localStorage
    for (const key of possibleKeys) {
      const orgId = localStorage.getItem(key);
      if (orgId) {
        console.log(`Organización encontrada en localStorage con clave: ${key}`, orgId);
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no está en localStorage, buscar en sessionStorage
    for (const key of possibleKeys) {
      const orgId = sessionStorage.getItem(key);
      if (orgId) {
        console.log(`Organización encontrada en sessionStorage con clave: ${key}`, orgId);
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no se encuentra, usar un valor predeterminado para desarrollo
    if (process.env.NODE_ENV !== 'production') {
      console.log('Usando ID de organización predeterminado para desarrollo: 2');
      setOrganizationId(2); // Valor predeterminado para desarrollo
    } else {
      console.error('No se pudo encontrar el ID de organización en el almacenamiento local');
    }
  }, []);
  
  // Cargar configuraciones de automatización desde Supabase
  useEffect(() => {
    const loadAutomationSettings = async () => {
      if (!pipelineId || !organizationId) return;
      
      try {
        setLoading(true);
        
        // Intenta obtener las configuraciones de automatización desde la tabla 'automations'
        const { data, error } = await supabase
          .from('automations')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });
          
        if (error) {
          console.error('Error al cargar configuraciones de automatización:', error);
        } else if (data && data.length > 0) {
          // Si encontramos datos, intentamos extraer la configuración
          // Buscamos las automatizaciones relacionadas con el pipeline actual
          const pipelineAutomations = data.filter(auto => {
            const triggerData = auto.trigger_json || {};
            return triggerData.pipeline_id === pipelineId;
          });
          
          if (pipelineAutomations.length > 0) {
            // Extraemos datos de la primera automatización del pipeline
            const autoData = pipelineAutomations[0];
            const actionsData = autoData.actions_json || {};
            
            setAutomationSettings({
              id: autoData.id,
              name: autoData.name,
              description: autoData.description,
              active: autoData.active || false,
              taskCreation: actionsData.create_tasks || true,
              notifications: actionsData.send_notifications || true,
              statusUpdate: actionsData.update_status || true,
              activityLog: actionsData.log_activity || true,
              reminders: actionsData.send_reminders || false,
              trigger_json: autoData.trigger_json,
              actions_json: autoData.actions_json
            });
          } else {
            console.log('No se encontraron automatizaciones específicas para este pipeline, usando valores por defecto');
          }
        } else {
          console.log('No se encontraron configuraciones de automatización, usando valores por defecto');
        }
      } catch (err) {
        console.error('Error inesperado al cargar configuraciones:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadAutomationSettings();
  }, [pipelineId, organizationId]);

  // Manejador para cambios de configuración
  const handleSettingChange = async (setting: keyof AutomationSettings) => {
    // Actualizar estado local primero para UI responsiva
    const newValue = !automationSettings[setting];
    
    setAutomationSettings(prev => ({
      ...prev,
      [setting]: newValue
    }));
    
    // No continuar si no tenemos ID de organización o pipeline
    if (!organizationId || !pipelineId) {
      console.error('No se puede guardar configuración: falta ID de organización o pipeline');
      return;
    }
    
    try {
      // Mapeo de configuraciones a estructura JSON de actions_json
      const actionsJSON = {
        create_tasks: automationSettings.taskCreation,
        send_notifications: automationSettings.notifications,
        update_status: automationSettings.statusUpdate,
        log_activity: automationSettings.activityLog,
        send_reminders: automationSettings.reminders
      };
      
      // Actualizar el campo específico que cambió
      // Solo mapeamos las configuraciones de automatizaciones que se modifican en la UI
      const settingMappings: Partial<Record<keyof AutomationSettings, string>> = {
        taskCreation: 'create_tasks',
        notifications: 'send_notifications',
        statusUpdate: 'update_status',
        activityLog: 'log_activity',
        reminders: 'send_reminders'
      };
      
      if (settingMappings[setting]) {
        actionsJSON[settingMappings[setting]] = newValue;
      }
      
      // Si tenemos un ID de automatización, actualizamos ese registro
      if (automationSettings.id) {
        const { error: updateError } = await supabase
          .from('automations')
          .update({ 
            actions_json: actionsJSON,
            updated_at: new Date().toISOString()
          })
          .eq('id', automationSettings.id);
          
        if (updateError) {
          throw new Error(`Error al actualizar configuración: ${updateError.message}`);
        }
      } else {
        // Si no existe, creamos un nuevo registro
        const triggerJSON = {
          pipeline_id: pipelineId,
          event_type: 'pipeline_change',
          conditions: []
        };
        
        const newRecord = {
          organization_id: organizationId,
          name: `Automatización para Pipeline ${pipelineId}`,
          description: 'Configuración de automatización del pipeline',
          active: true,
          trigger_json: triggerJSON,
          actions_json: actionsJSON,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const { data: insertedData, error: insertError } = await supabase
          .from('automations')
          .insert([newRecord])
          .select('id');
          
        if (insertError) {
          throw new Error(`Error al crear configuración: ${insertError.message}`);
        }
        
        // Actualizar el ID en el estado local
        if (insertedData && insertedData[0]) {
          setAutomationSettings(prev => ({
            ...prev,
            id: insertedData[0].id
          }));
        }
      }
    } catch (err) {
      console.error('Error al guardar configuración:', err);
      // Revertir cambio local en caso de error
      setAutomationSettings(prev => ({
        ...prev,
        [setting]: !newValue
      }));
    }
  };

  // Mostrar esqueleto mientras carga
  if (loading) {
    return (
      <div className="p-4">
        <div className="flex justify-center items-center h-40">
          <LoadingSpinner size="lg" className="text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="max-w-4xl mx-auto">
        {/* Sección de configuraciones de automatización */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-500" />
              <CardTitle>Configuraciones de automatización</CardTitle>
            </div>
            <CardDescription>
              Configura las acciones automáticas que ocurrirán cuando las oportunidades cambien de etapa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Creación de tareas */}
            <div className="flex items-start justify-between space-x-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-blue-500" />
                  <Label htmlFor="task-creation" className="font-medium">
                    Creación automática de tareas
                  </Label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Crea tareas de seguimiento automáticamente cuando una oportunidad cambia de etapa
                </p>
              </div>
              <Switch
                id="task-creation"
                checked={automationSettings.taskCreation}
                onCheckedChange={() => handleSettingChange('taskCreation')}
              />
            </div>
            
            <Separator />
            
            {/* Notificaciones */}
            <div className="flex items-start justify-between space-x-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-blue-500" />
                  <Label htmlFor="notifications" className="font-medium">
                    Notificaciones automáticas
                  </Label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Envía notificaciones a los usuarios responsables cuando hay cambios en las oportunidades
                </p>
              </div>
              <Switch
                id="notifications"
                checked={automationSettings.notifications}
                onCheckedChange={() => handleSettingChange('notifications')}
              />
            </div>
            
            <Separator />
            
            {/* Actualización de estados */}
            <div className="flex items-start justify-between space-x-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <Label htmlFor="status-update" className="font-medium">
                    Actualización de estados
                  </Label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Actualiza automáticamente el estado de las oportunidades según la etapa
                </p>
              </div>
              <Switch
                id="status-update"
                checked={automationSettings.statusUpdate}
                onCheckedChange={() => handleSettingChange('statusUpdate')}
              />
            </div>
            
            <Separator />
            
            {/* Registro de actividad */}
            <div className="flex items-start justify-between space-x-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-blue-500" />
                  <Label htmlFor="activity-log" className="font-medium">
                    Registro de actividad
                  </Label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Registra todas las actividades y cambios relacionados con las oportunidades
                </p>
              </div>
              <Switch
                id="activity-log"
                checked={automationSettings.activityLog}
                onCheckedChange={() => handleSettingChange('activityLog')}
              />
            </div>
            
            <Separator />
            
            {/* Recordatorios */}
            <div className="flex items-start justify-between space-x-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-blue-500" />
                  <Label htmlFor="reminders" className="font-medium">
                    Recordatorios automáticos
                  </Label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Envía recordatorios para seguimiento de oportunidades inactivas
                </p>
              </div>
              <Switch
                id="reminders"
                checked={automationSettings.reminders}
                onCheckedChange={() => handleSettingChange('reminders')}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t pt-4">
            <Button variant="outline" className="mr-2">
              Cancelar
            </Button>
            <Button>
              Guardar cambios
            </Button>
          </CardFooter>
        </Card>
        
        {/* Sección de automatizaciones específicas por etapa */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-500" />
              <CardTitle>Automatizaciones por etapa</CardTitle>
            </div>
            <CardDescription>
              Configura acciones específicas para cada etapa del pipeline
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center py-8 text-gray-500 dark:text-gray-400">
              La configuración avanzada por etapa estará disponible próximamente
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AutomationsView;
