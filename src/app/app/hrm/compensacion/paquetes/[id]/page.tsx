'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import CompensationPackagesService from '@/lib/services/compensationPackagesService';
import type { 
  CompensationPackage, 
  CompensationComponent,
  CreateComponentDTO,
  UpdateComponentDTO 
} from '@/lib/services/compensationPackagesService';
import { ComponentsTable, ComponentForm } from '@/components/hrm/compensacion/paquetes/[id]';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  DollarSign,
  RefreshCw,
  Plus,
  Edit,
  Calendar,
  Layers,
  Building,
} from 'lucide-react';

export default function PaqueteDetallePage() {
  const params = useParams();
  const router = useRouter();
  const packageId = params.id as string;
  
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [pkg, setPkg] = useState<CompensationPackage | null>(null);
  const [components, setComponents] = useState<CompensationComponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Form states
  const [isComponentFormOpen, setIsComponentFormOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<CompensationComponent | null>(null);
  const [deleteComponentId, setDeleteComponentId] = useState<string | null>(null);
  
  // Helper data
  const [componentTypes, setComponentTypes] = useState<{ value: string; label: string }[]>([]);
  const [amountTypes, setAmountTypes] = useState<{ value: string; label: string }[]>([]);
  const [frequencies, setFrequencies] = useState<{ value: string; label: string }[]>([]);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new CompensationPackagesService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [packageData, componentsData] = await Promise.all([
        service.getById(packageId),
        service.getComponents(packageId),
      ]);

      if (!packageData) {
        toast({
          title: 'Error',
          description: 'Paquete no encontrado',
          variant: 'destructive',
        });
        router.push('/app/hrm/compensacion/paquetes');
        return;
      }

      setPkg(packageData);
      setComponents(componentsData);
      setComponentTypes(service.getComponentTypes());
      setAmountTypes(service.getAmountTypes());
      setFrequencies(service.getFrequencies());
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el paquete',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, packageId, router, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && packageId) {
      loadData();
    }
  }, [organization?.id, orgLoading, packageId, loadData]);

  // Handlers
  const handleToggleActive = async () => {
    if (!pkg) return;
    const service = getService();
    if (!service) return;

    try {
      await service.toggleActive(pkg.id, !pkg.is_active);
      toast({ title: pkg.is_active ? 'Paquete desactivado' : 'Paquete activado' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleCreateComponent = async (data: CreateComponentDTO | UpdateComponentDTO) => {
    const service = getService();
    if (!service) return;

    try {
      await service.createComponent(data as CreateComponentDTO);
      toast({ title: 'Componente agregado correctamente' });
      setIsComponentFormOpen(false);
      await loadData();
    } catch (error: any) {
      throw error;
    }
  };

  const handleUpdateComponent = async (data: UpdateComponentDTO) => {
    if (!editingComponent) return;
    const service = getService();
    if (!service) return;

    try {
      await service.updateComponent(editingComponent.id, data);
      toast({ title: 'Componente actualizado correctamente' });
      setEditingComponent(null);
      await loadData();
    } catch (error: any) {
      throw error;
    }
  };

  const handleDeleteComponent = async () => {
    if (!deleteComponentId) return;
    const service = getService();
    if (!service) return;

    try {
      await service.deleteComponent(deleteComponentId);
      toast({ title: 'Componente eliminado' });
      setDeleteComponentId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el componente',
        variant: 'destructive',
      });
    }
  };

  const handleToggleComponentActive = async (component: CompensationComponent) => {
    const service = getService();
    if (!service) return;

    try {
      await service.toggleComponentActive(component.id, !component.is_active);
      toast({ title: component.is_active ? 'Componente desactivado' : 'Componente activado' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  // Calculate totals
  const calculateTotal = () => {
    const activeComponents = components.filter(c => c.is_active);
    let total = pkg?.base_salary || 0;
    
    activeComponents.forEach(comp => {
      if (comp.amount_type === 'fixed' && comp.amount) {
        if (comp.component_type === 'deduction') {
          total -= comp.amount;
        } else {
          total += comp.amount;
        }
      }
    });
    
    return total;
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Paquete no encontrado</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm/compensacion/paquetes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <DollarSign className="h-7 w-7 text-blue-600" />
              {pkg.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {pkg.code || 'Sin código'} • HRM / Compensación / Paquetes / Detalle
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href={`/app/hrm/compensacion/paquetes`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Editar Paquete
            </Button>
          </Link>
        </div>
      </div>

      {/* Package Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-white">Información del Paquete</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {pkg.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <Switch
                  checked={pkg.is_active}
                  onCheckedChange={handleToggleActive}
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pkg.description && (
              <p className="text-gray-600 dark:text-gray-300">{pkg.description}</p>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Salario Base</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {pkg.base_salary
                    ? formatCurrency(pkg.base_salary, pkg.currency_code)
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Moneda</p>
                <Badge variant="outline" className="font-mono mt-1">
                  {pkg.currency_code}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Período</p>
                <p className="text-gray-900 dark:text-white capitalize">
                  {pkg.salary_period || 'Mensual'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Componentes</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {components.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Calendar className="h-4 w-4" />
                <span>
                  Válido: {pkg.valid_from ? formatDate(pkg.valid_from) : 'Sin inicio'}
                  {' - '}
                  {pkg.valid_to ? formatDate(pkg.valid_to) : 'Sin fin'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Summary */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-blue-900 dark:text-blue-100">
              Resumen de Compensación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Salario Base</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {pkg.base_salary
                  ? formatCurrency(pkg.base_salary, pkg.currency_code)
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Total Estimado</p>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(calculateTotal(), pkg.currency_code)}
              </p>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              * El total incluye componentes fijos activos. Los porcentajes y fórmulas se calculan en nómina.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Components Section */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Layers className="h-5 w-5 text-blue-600" />
            Componentes del Paquete
          </CardTitle>
          <Button
            onClick={() => setIsComponentFormOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar Componente
          </Button>
        </CardHeader>
        <CardContent>
          <ComponentsTable
            components={components}
            currencyCode={pkg.currency_code}
            onEdit={(comp) => setEditingComponent(comp)}
            onDelete={(comp) => setDeleteComponentId(comp.id)}
            onToggleActive={handleToggleComponentActive}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/compensacion/paquetes">
              <Button variant="outline" size="sm">
                ← Volver a Paquetes
              </Button>
            </Link>
            <Link href="/app/hrm/compensacion/asignaciones">
              <Button variant="outline" size="sm">
                Ver Asignaciones →
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Create Component Dialog */}
      <Dialog open={isComponentFormOpen} onOpenChange={setIsComponentFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle>Agregar Componente</DialogTitle>
          </DialogHeader>
          <ComponentForm
            packageId={packageId}
            componentTypes={componentTypes}
            amountTypes={amountTypes}
            frequencies={frequencies}
            onSubmit={handleCreateComponent}
            onCancel={() => setIsComponentFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Component Dialog */}
      <Dialog open={!!editingComponent} onOpenChange={() => setEditingComponent(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle>Editar Componente</DialogTitle>
          </DialogHeader>
          <ComponentForm
            packageId={packageId}
            component={editingComponent}
            componentTypes={componentTypes}
            amountTypes={amountTypes}
            frequencies={frequencies}
            onSubmit={handleUpdateComponent}
            onCancel={() => setEditingComponent(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Component Dialog */}
      <AlertDialog open={!!deleteComponentId} onOpenChange={() => setDeleteComponentId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar componente?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteComponent}
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
