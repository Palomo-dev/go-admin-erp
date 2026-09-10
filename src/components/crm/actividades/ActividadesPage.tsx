'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Plus, RefreshCw, ArrowLeft, CalendarClock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { ActividadesFiltros } from './ActividadesFiltros';
import { ActividadesStats } from './ActividadesStats';
import { ActividadesTable } from './ActividadesTable';
import { ActividadForm } from './ActividadForm';
import { ActividadesPagination } from './ActividadesPagination';
import { actividadesService, type OrgUserOption } from './ActividadesService';
import { QuickActionsBar } from '@/components/crm/shared/QuickActionsBar';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { describeError } from '@/lib/utils/errorMessage';
import { SearchSelect } from '@/components/ui/search-select';
import {
  Activity,
  ActivityFilters,
  ActivityStats,
  CreateActivityInput,
  RelatedType,
  UpdateActivityInput,
} from './types';
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

// Diálogo unificado de tarea (compacto + completo): las tareas no son filas de
// `activities`, se crean aquí con la misma lógica que el resto del CRM.
const TaskDialog = dynamic(() => import('@/components/crm/shared/TaskDialog').then((m) => m.TaskDialog), {
  ssr: false,
});

const EMPTY_STATS: ActivityStats = {
  total: 0,
  calls: 0,
  emails: 0,
  whatsapp: 0,
  meetings: 0,
  notes: 0,
  tasks: 0,
};

interface CustomerOption {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
}

export function ActividadesPage() {
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [stats, setStats] = useState<ActivityStats>(EMPTY_STATS);
  const [filters, setFilters] = useState<ActivityFilters>({});
  const [users, setUsers] = useState<OrgUserOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [opportunities, setOpportunities] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteActivity, setDeleteActivity] = useState<Activity | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ type: RelatedType; id: string } | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const selectedCustomer = selectedCustomerId
    ? customers.find((c) => c.id === selectedCustomerId) ?? null
    : null;

  /**
   * Una sola carga: página de actividades + totales + catálogos.
   * Si algo falla se guarda el mensaje y la pantalla ofrece «Reintentar»
   * (antes el error se tragaba y quedaba una lista vacía indistinguible).
   */
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [pageData, statsData, usersData, customersData, opportunitiesData] = await Promise.all([
        actividadesService.listActivities(filters, { page: currentPage, pageSize }),
        actividadesService.getStats(filters),
        actividadesService.getUsers(),
        actividadesService.getCustomers(),
        actividadesService.getOpportunities(),
      ]);

      setActivities(pageData.rows);
      setTotalItems(pageData.total);
      setStats(statsData);
      setUsers(usersData);
      setCustomers(customersData);
      setOpportunities(opportunitiesData);
    } catch (error) {
      setActivities([]);
      setTotalItems(0);
      setStats(EMPTY_STATS);
      setLoadError(describeError(error));
    } finally {
      setIsLoading(false);
    }
  }, [filters, currentPage, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Si al borrar o filtrar la página actual deja de existir, se vuelve atrás.
  useEffect(() => {
    if (!isLoading && currentPage > totalPages) setCurrentPage(totalPages);
  }, [isLoading, currentPage, totalPages]);

  const hasFilters = Object.values(filters).some((v) => v !== undefined && v !== '');

  const handleFiltersChange = (newFilters: ActivityFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleNewActivity = () => {
    setEditingActivity(null);
    setIsFormOpen(true);
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setIsFormOpen(true);
  };

  /** «Tarea» en el diálogo de actividad abre el diálogo unificado de tarea. */
  const handleRequestTask = (related: { type: RelatedType; id: string } | null) => {
    if (!related) {
      toast({
        title: 'Elige antes el cliente o la oportunidad',
        description: 'La tarea queda ligada a esa ficha.',
        variant: 'destructive',
      });
      return;
    }
    setIsFormOpen(false);
    setTaskDialog(related);
    setIsTaskDialogOpen(true);
  };

  const handleDuplicateActivity = async (activity: Activity) => {
    try {
      await actividadesService.duplicateActivity(activity.id);
      toast({ title: 'Actividad duplicada', description: 'Se creó una copia con la fecha de hoy.' });
      loadData();
    } catch (error) {
      toast({
        title: 'No se pudo duplicar la actividad',
        description: describeError(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteActivity = async () => {
    if (!deleteActivity) return;
    try {
      await actividadesService.deleteActivity(deleteActivity.id);
      toast({ title: 'Actividad eliminada' });
      loadData();
    } catch (error) {
      toast({
        title: 'No se pudo eliminar la actividad',
        description: describeError(error),
        variant: 'destructive',
      });
    } finally {
      setDeleteActivity(null);
    }
  };

  const handleSaveActivity = async (data: CreateActivityInput | UpdateActivityInput) => {
    setIsSaving(true);
    try {
      if (editingActivity) {
        await actividadesService.updateActivity(editingActivity.id, data);
        toast({ title: 'Actividad actualizada' });
      } else {
        await actividadesService.createActivity(data as CreateActivityInput);
        toast({ title: 'Actividad registrada' });
      }
      setIsFormOpen(false);
      loadData();
    } catch (error) {
      toast({
        title: 'No se pudo guardar la actividad',
        description: describeError(error),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/crm">
            <Button variant="ghost" size="icon" aria-label="Volver al CRM">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <CalendarClock className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
              </div>
              Actividades
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Llamadas, correos, WhatsApp, reuniones y notas del equipo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={loadData}
            disabled={isLoading}
            aria-label="Recargar"
            className="dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleNewActivity} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Actividad
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowQuickActions(!showQuickActions)}
            aria-expanded={showQuickActions}
            className="dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            <Zap className="h-4 w-4 mr-2" />
            Acciones rápidas
          </Button>
        </div>
      </div>

      {/* Acciones rápidas — la misma barra del pipeline y de la ficha 360 */}
      {showQuickActions && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Contactar ahora (llamada, correo, WhatsApp, reunión, tarea o nota)
          </h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">
                Selecciona un cliente para activar las acciones
              </Label>
              <SearchSelect
                options={customers.map((c) => ({ value: c.id, label: c.full_name }))}
                value={selectedCustomerId || 'none'}
                onValueChange={(v) => setSelectedCustomerId(v === 'none' ? '' : v)}
                placeholder="Sin cliente"
                searchPlaceholder="Buscar cliente..."
                noneLabel="Sin cliente"
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>
            {selectedCustomer ? (
              <QuickActionsBar
                variant="detail"
                customerId={selectedCustomer.id}
                customer={{
                  id: selectedCustomer.id,
                  full_name: selectedCustomer.full_name,
                  email: selectedCustomer.email ?? null,
                  phone: selectedCustomer.phone ?? null,
                }}
                onActionCompleted={() => loadData()}
              />
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
                Selecciona un cliente para habilitar Llamar, Email, WhatsApp, Reunión, Tarea y Nota.
              </p>
            )}
          </div>
        </div>
      )}

      {loadError ? (
        <LoadErrorState message={loadError} onRetry={loadData} isRetrying={isLoading} />
      ) : (
        <>
          <ActividadesStats stats={stats} isLoading={isLoading} />

          <ActividadesFiltros filters={filters} onFiltersChange={handleFiltersChange} users={users} />

          <ActividadesTable
            activities={activities}
            isLoading={isLoading}
            hasFilters={hasFilters}
            onEdit={handleEditActivity}
            onDuplicate={handleDuplicateActivity}
            onDelete={setDeleteActivity}
            onCreate={handleNewActivity}
            onClearFilters={() => handleFiltersChange({})}
          />

          {totalItems > 0 && (
            <ActividadesPagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setCurrentPage}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </>
      )}

      {/* Formulario */}
      <ActividadForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        activity={editingActivity}
        customers={customers}
        opportunities={opportunities}
        onSave={handleSaveActivity}
        isLoading={isSaving}
        onRequestTask={handleRequestTask}
      />

      {/* Tarea: mismo diálogo que el pipeline y las acciones rápidas */}
      {taskDialog && (
        <TaskDialog
          open={isTaskDialogOpen}
          onOpenChange={(open) => {
            setIsTaskDialogOpen(open);
            if (!open) setTaskDialog(null);
          }}
          mode="compact"
          relatedType={taskDialog.type}
          relatedId={taskDialog.id}
          customerId={taskDialog.type === 'customer' ? taskDialog.id : undefined}
          onSaved={() => loadData()}
        />
      )}

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!deleteActivity} onOpenChange={() => setDeleteActivity(null)}>
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
            <AlertDialogCancel className="border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteActivity}
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
