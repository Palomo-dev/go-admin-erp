'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import EmploymentCompensationService from '@/lib/services/employmentCompensationService';
import type { EmploymentCompensation, CreateAssignmentDTO, UpdateAssignmentDTO } from '@/lib/services/employmentCompensationService';
import { AssignmentsTable, AssignmentForm } from '@/components/hrm/compensacion/asignaciones';
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
  Users,
  Plus,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  ArrowLeft,
  UserPlus,
} from 'lucide-react';

export default function AsignacionesCompensacionPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [assignments, setAssignments] = useState<EmploymentCompensation[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, ended: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<EmploymentCompensation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [endAssignmentId, setEndAssignmentId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Helper data
  const [employees, setEmployees] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [packages, setPackages] = useState<{ id: string; name: string; base_salary: number | null; currency_code: string }[]>([]);
  const [statuses, setStatuses] = useState<{ value: string; label: string }[]>([]);

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new EmploymentCompensationService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [assignmentsData, statsData, empData, pkgData] = await Promise.all([
        service.getAll(),
        service.getStats(),
        service.getEmployees(),
        service.getPackages(),
      ]);

      // Filter by search term
      let filtered = assignmentsData;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = assignmentsData.filter(a => 
          a.employee_name?.toLowerCase().includes(term) ||
          a.package_name?.toLowerCase().includes(term) ||
          a.employee_code?.toLowerCase().includes(term)
        );
      }

      setAssignments(filtered);
      setStats(statsData);
      setEmployees(empData);
      setPackages(pkgData);
      setStatuses(service.getStatuses());
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las asignaciones',
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
  const handleCreate = async (data: CreateAssignmentDTO | UpdateAssignmentDTO) => {
    const service = getService();
    if (!service) return;

    try {
      await service.create(data as CreateAssignmentDTO);
      toast({ title: 'Asignación creada correctamente' });
      setIsFormOpen(false);
      await loadData();
    } catch (error: any) {
      throw error;
    }
  };

  const handleUpdate = async (data: UpdateAssignmentDTO) => {
    if (!editingAssignment) return;
    const service = getService();
    if (!service) return;

    try {
      await service.update(editingAssignment.id, data);
      toast({ title: 'Asignación actualizada correctamente' });
      setEditingAssignment(null);
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
      toast({ title: 'Asignación eliminada' });
      setDeleteId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la asignación',
        variant: 'destructive',
      });
    }
  };

  const handleEndAssignment = async () => {
    if (!endAssignmentId || !endDate) return;
    const service = getService();
    if (!service) return;

    try {
      await service.endAssignment(endAssignmentId, endDate);
      toast({ title: 'Vigencia finalizada' });
      setEndAssignmentId(null);
      setEndDate(new Date().toISOString().split('T')[0]);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudo finalizar la vigencia',
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
              <UserPlus className="h-7 w-7 text-blue-600" />
              Asignaciones de Compensación
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              HRM / Compensación / Asignaciones
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
            Nueva Asignación
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Vigentes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Pendientes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Finalizados</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.ended}</p>
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
              placeholder="Buscar por empleado o paquete..."
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
          <AssignmentsTable
            assignments={assignments}
            onEdit={(a) => setEditingAssignment(a)}
            onDelete={(a) => setDeleteId(a.id)}
            onEndAssignment={(a) => setEndAssignmentId(a.id)}
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
                ← Paquetes
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
            <DialogTitle>Nueva Asignación de Compensación</DialogTitle>
          </DialogHeader>
          <AssignmentForm
            employees={employees}
            packages={packages}
            statuses={statuses}
            onSubmit={handleCreate}
            onCancel={() => setIsFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Form Dialog */}
      <Dialog open={!!editingAssignment} onOpenChange={() => setEditingAssignment(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle>Editar Asignación</DialogTitle>
          </DialogHeader>
          <AssignmentForm
            assignment={editingAssignment}
            employees={employees}
            packages={packages}
            statuses={statuses}
            onSubmit={handleUpdate}
            onCancel={() => setEditingAssignment(null)}
          />
        </DialogContent>
      </Dialog>

      {/* End Assignment Dialog */}
      <AlertDialog open={!!endAssignmentId} onOpenChange={() => setEndAssignmentId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              Finalizar vigencia de asignación
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Selecciona la fecha en la que finaliza esta asignación de compensación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndAssignment}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar asignación?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. El historial de compensación se perderá.
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
