'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import ShiftRotationsService from '@/lib/services/shiftRotationsService';
import ShiftTemplatesService from '@/lib/services/shiftTemplatesService';
import type { ShiftRotation } from '@/lib/services/shiftRotationsService';
import type { ShiftTemplate } from '@/lib/services/shiftTemplatesService';
import { RotationTable, RotationForm } from '@/components/hrm/rotaciones';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Plus,
  RefreshCw,
  Search,
  RotateCw,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';

export default function RotacionesPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [rotations, setRotations] = useState<ShiftRotation[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editingRotation, setEditingRotation] = useState<ShiftRotation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

  // Servicios
  const getRotationsService = useCallback(() => {
    if (!organization?.id) return null;
    return new ShiftRotationsService(organization.id);
  }, [organization?.id]);

  const getTemplatesService = useCallback(() => {
    if (!organization?.id) return null;
    return new ShiftTemplatesService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const rotService = getRotationsService();
    const tplService = getTemplatesService();
    if (!rotService || !tplService) return;

    setIsLoading(true);
    try {
      const [rotationsData, templatesData, statsData] = await Promise.all([
        rotService.getAll(true),
        tplService.getAll(true),
        rotService.getStats(),
      ]);

      setRotations(rotationsData);
      setTemplates(templatesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading rotations:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las rotaciones',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getRotationsService, getTemplatesService, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Filtrar
  const filteredRotations = rotations.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && r.is_active) ||
      (statusFilter === 'inactive' && !r.is_active);

    return matchesSearch && matchesStatus;
  });

  // Handlers
  const handleCreate = () => {
    setEditingRotation(null);
    setFormOpen(true);
  };

  const handleEdit = (id: string) => {
    const rotation = rotations.find((r) => r.id === id);
    if (rotation) {
      setEditingRotation(rotation);
      setFormOpen(true);
    }
  };

  const handleDuplicate = async (id: string) => {
    const service = getRotationsService();
    if (!service) return;

    try {
      await service.duplicate(id);
      toast({
        title: 'Rotación duplicada',
        description: 'Se creó una copia de la rotación',
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo duplicar',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (id: string) => {
    const service = getRotationsService();
    if (!service) return;

    try {
      const updated = await service.toggleActive(id);
      toast({
        title: updated.is_active ? 'Rotación activada' : 'Rotación desactivada',
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    const service = getRotationsService();
    if (!service) return;

    try {
      await service.delete(deleteId);
      toast({ title: 'Rotación eliminada' });
      setDeleteId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (data: any) => {
    const service = getRotationsService();
    if (!service) return;

    if (editingRotation) {
      await service.update(editingRotation.id, data);
      toast({ title: 'Rotación actualizada' });
    } else {
      await service.create(data);
      toast({ title: 'Rotación creada' });
    }
    await loadData();
  };

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <RotateCw className="h-7 w-7 text-blue-600" />
            Rotaciones de Turno
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Patrones rotativos para asignación automática
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Rotación
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <RotateCw className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.total}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.active}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Activas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">
                  {stats.inactive}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Inactivas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar rotaciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-white dark:bg-gray-900"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="inactive">Inactivas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <RotationTable
            rotations={filteredRotations}
            templates={templates.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onToggleActive={handleToggleActive}
            onDelete={(id) => setDeleteId(id)}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/app/hrm/turnos" className="hover:text-blue-600 dark:hover:text-blue-400">
          ← Calendario de Turnos
        </Link>
        <span>|</span>
        <Link href="/app/hrm/plantillas-turno" className="hover:text-blue-600 dark:hover:text-blue-400">
          Plantillas de Turno →
        </Link>
      </div>

      {/* Form Modal */}
      <RotationForm
        open={formOpen}
        onOpenChange={setFormOpen}
        rotation={editingRotation}
        templates={templates.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        onSubmit={handleSubmit}
      />

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar rotación?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
