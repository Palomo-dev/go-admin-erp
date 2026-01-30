'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Phone,
  Mail,
  Users,
  StickyNote,
  MapPin,
  MessageCircle,
  Settings,
  Calendar,
  User,
  Briefcase,
  Clock,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { actividadesService } from '../ActividadesService';
import { ActividadForm } from '../ActividadForm';
import { Activity, ACTIVITY_TYPE_CONFIG, CreateActivityInput, UpdateActivityInput } from '../types';

interface ActividadDetalleProps {
  activityId: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Phone,
  Mail,
  Users,
  StickyNote,
  MapPin,
  MessageCircle,
  Settings,
};

export function ActividadDetalle({ activityId }: ActividadDetalleProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [customers, setCustomers] = useState<{ id: string; full_name: string; email?: string }[]>([]);
  const [opportunities, setOpportunities] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, [activityId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [activityData, customersData, opportunitiesData] = await Promise.all([
        actividadesService.getActivityById(activityId),
        actividadesService.getCustomers(),
        actividadesService.getOpportunities(),
      ]);

      setActivity(activityData);
      setCustomers(customersData);
      setOpportunities(opportunitiesData);

      if (!activityData) {
        toast({
          title: 'Error',
          description: 'No se encontró la actividad',
          variant: 'destructive',
        });
        router.push('/app/crm/actividades');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cargar la actividad',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (data: CreateActivityInput | UpdateActivityInput) => {
    if (!activity) return;

    setIsSaving(true);
    try {
      const updated = await actividadesService.updateActivity(activity.id, data);
      if (updated) {
        toast({
          title: 'Actividad actualizada',
          description: 'Los cambios se han guardado correctamente',
        });
        setIsFormOpen(false);
        loadData();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la actividad',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activity) return;

    try {
      const success = await actividadesService.deleteActivity(activity.id);
      if (success) {
        toast({
          title: 'Actividad eliminada',
          description: 'La actividad se ha eliminado correctamente',
        });
        router.push('/app/crm/actividades');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la actividad',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Cargando actividad...</p>
        </div>
      </div>
    );
  }

  if (!activity) {
    return null;
  }

  const config = ACTIVITY_TYPE_CONFIG[activity.activity_type] || ACTIVITY_TYPE_CONFIG.note;
  const Icon = iconMap[config.icon] || StickyNote;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/app/crm/actividades')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${config.bgColor} ${config.darkBgColor}`}>
              <Icon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {config.label}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Detalle de actividad
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsFormOpen(true)}
            className="border-gray-200 dark:border-gray-700"
          >
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowDeleteDialog(true)}
            className="border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notas */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">
                Descripción
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {activity.notes || 'Sin descripción'}
              </p>
            </CardContent>
          </Card>

          {/* Metadata */}
          {activity.metadata && Object.keys(activity.metadata).length > 0 && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-gray-100">
                  Información adicional
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-auto">
                  {JSON.stringify(activity.metadata, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Detalles */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">
                Detalles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tipo */}
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.bgColor} ${config.darkBgColor}`}>
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tipo</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {config.label}
                  </p>
                </div>
              </div>

              <Separator className="bg-gray-200 dark:bg-gray-700" />

              {/* Fecha */}
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-900">
                  <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Fecha</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {format(new Date(activity.occurred_at), "PPP 'a las' HH:mm", { locale: es })}
                  </p>
                </div>
              </div>

              <Separator className="bg-gray-200 dark:bg-gray-700" />

              {/* Creación */}
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-900">
                  <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Creada</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {format(new Date(activity.created_at), "PPP", { locale: es })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Relacionado */}
          {(activity.customer || activity.opportunity) && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-gray-100">
                  Relacionado con
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activity.related_type === 'customer' && activity.customer && (
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    onClick={() => router.push(`/app/crm/clientes/${activity.customer?.id}`)}
                  >
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
                      <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Cliente</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {activity.customer.full_name}
                      </p>
                      {activity.customer.email && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {activity.customer.email}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {activity.related_type === 'opportunity' && activity.opportunity && (
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                    onClick={() => router.push(`/app/crm/oportunidades/${activity.opportunity?.id}`)}
                  >
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/50">
                      <Briefcase className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-purple-600 dark:text-purple-400">Oportunidad</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {activity.opportunity.title}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Formulario de edición */}
      <ActividadForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        activity={activity}
        customers={customers}
        opportunities={opportunities}
        onSave={handleSave}
        isLoading={isSaving}
      />

      {/* Confirmación de eliminación */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-white dark:bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-100">
              ¿Eliminar actividad?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. La actividad será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200 dark:border-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
