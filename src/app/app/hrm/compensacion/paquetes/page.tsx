'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import CompensationPackagesService from '@/lib/services/compensationPackagesService';
import type { CompensationPackage, CreatePackageDTO, UpdatePackageDTO } from '@/lib/services/compensationPackagesService';
import { PackagesTable, PackageForm } from '@/components/hrm/compensacion/paquetes';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  RefreshCw,
  DollarSign,
  Plus,
  Search,
  Package,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';

export default function PaquetesCompensacionPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [packages, setPackages] = useState<CompensationPackage[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, avgSalary: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<CompensationPackage | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Helper data
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [salaryPeriods, setSalaryPeriods] = useState<{ value: string; label: string }[]>([]);
  const [positions, setPositions] = useState<{ id: string; name: string; level: string | null }[]>([]);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new CompensationPackagesService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [packagesData, statsData, currData, periodsData, posData] = await Promise.all([
        service.getAll({ search: searchTerm }),
        service.getStats(),
        service.getCurrencies(),
        service.getSalaryPeriods(),
        service.getJobPositions(),
      ]);

      setPackages(packagesData);
      setStats(statsData);
      setCurrencies(currData);
      setSalaryPeriods(periodsData);
      setPositions(posData);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los paquetes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, searchTerm, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleCreate = async (data: CreatePackageDTO | UpdatePackageDTO) => {
    const service = getService();
    if (!service) return;

    try {
      await service.create(data as CreatePackageDTO);
      toast({ title: 'Paquete creado correctamente' });
      setIsFormOpen(false);
      await loadData();
    } catch (error: any) {
      throw error;
    }
  };

  const handleUpdate = async (data: UpdatePackageDTO) => {
    if (!editingPackage) return;
    const service = getService();
    if (!service) return;

    try {
      await service.update(editingPackage.id, data);
      toast({ title: 'Paquete actualizado correctamente' });
      setEditingPackage(null);
      await loadData();
    } catch (error: any) {
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const service = getService();
    if (!service) return;

    try {
      await service.delete(deleteId);
      toast({ title: 'Paquete eliminado' });
      setDeleteId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el paquete',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (pkg: CompensationPackage) => {
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

  const handleDuplicate = async (pkg: CompensationPackage) => {
    const service = getService();
    if (!service) return;

    try {
      await service.duplicate(pkg.id, `${pkg.name} (copia)`);
      toast({ title: 'Paquete duplicado correctamente' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo duplicar el paquete',
        variant: 'destructive',
      });
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/hrm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <DollarSign className="h-7 w-7 text-blue-600" />
              Paquetes de Compensación
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Compensación / Paquetes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => setIsFormOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Paquete
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Activos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <XCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Inactivos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.inactive}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Salario Promedio</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP',
                    minimumFractionDigits: 0,
                  }).format(stats.avgSalary)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <PackagesTable
            packages={packages}
            onEdit={(pkg) => setEditingPackage(pkg)}
            onDuplicate={handleDuplicate}
            onDelete={(pkg) => setDeleteId(pkg.id)}
            onToggleActive={handleToggleActive}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/app/hrm/compensacion/asignaciones">
              <Button variant="outline" size="sm">
                Asignaciones →
              </Button>
            </Link>
            <Link href="/app/hrm">
              <Button variant="outline" size="sm">
                ← Volver a HRM
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Create Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle>Nuevo Paquete de Compensación</DialogTitle>
          </DialogHeader>
          <PackageForm
            currencies={currencies}
            salaryPeriods={salaryPeriods}
            positions={positions}
            onSubmit={handleCreate}
            onCancel={() => setIsFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Form Dialog */}
      <Dialog open={!!editingPackage} onOpenChange={() => setEditingPackage(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle>Editar Paquete de Compensación</DialogTitle>
          </DialogHeader>
          <PackageForm
            package={editingPackage}
            currencies={currencies}
            salaryPeriods={salaryPeriods}
            positions={positions}
            onSubmit={handleUpdate}
            onCancel={() => setEditingPackage(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar paquete de compensación?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. Las asignaciones existentes podrían verse afectadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
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
