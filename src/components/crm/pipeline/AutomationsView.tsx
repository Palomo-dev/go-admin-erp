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
  taskCreation: boolean;
  notifications: boolean;
  statusUpdate: boolean;
  activityLog: boolean;
  reminders: boolean;
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

  // Obtener el ID de la organización del localStorage
  useEffect(() => {
    const orgId = localStorage.getItem("currentOrganizationId");
    if (orgId) {
      setOrganizationId(Number(orgId));
    }
    
    // Simulamos carga de configuraciones (en una implementación real, cargaríamos desde Supabase)
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  }, []);

  // Manejador para cambios de configuración
  const handleSettingChange = (setting: keyof AutomationSettings) => {
    setAutomationSettings(prev => ({
      ...prev,
      [setting]: !prev[setting]
    }));
    
    // Aquí se implementaría la actualización en Supabase
    console.log(`Configuración cambiada: ${setting}`);
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
