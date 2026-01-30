'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
  Loader2, 
  Calendar, 
  Users, 
  Clock, 
  CheckCircle2, 
  XCircle,
  TrendingUp 
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ClassesHeader, 
  ClassesFilters, 
  ClassCard, 
  ClassDialog,
  ClassCalendarView,
  ClassImportDialog,
  type ViewMode
} from '@/components/gym/clases';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  GymClass,
  Instructor,
  getClasses,
  getInstructors,
  createClass,
  updateClass,
  deleteClass,
  cancelClass,
  duplicateClass,
} from '@/lib/services/gymService';
import { branchService } from '@/lib/services/branchService';
import { Branch } from '@/types/branch';

export default function ClasesPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [showDialog, setShowDialog] = useState(false);
  const [selectedClass, setSelectedClass] = useState<GymClass | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<Date | null>(null);

  const [showImportDialog, setShowImportDialog] = useState(false);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [notifyMembers, setNotifyMembers] = useState(false);
  const [classToCancel, setClassToCancel] = useState<GymClass | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [classToDelete, setClassToDelete] = useState<GymClass | null>(null);

  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState('');
  const [classToDuplicate, setClassToDuplicate] = useState<GymClass | null>(null);

  const loadClasses = async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const data = await getClasses(organization.id, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        classType: typeFilter !== 'all' ? typeFilter : undefined,
      });
      setClasses(data);
    } catch (error) {
      console.error('Error cargando clases:', error);
      toast.error('Error al cargar las clases');
    } finally {
      setIsLoading(false);
    }
  };

  const loadBranchesAndInstructors = async () => {
    if (!organization?.id) return;
    try {
      const [branchesData, instructorsData] = await Promise.all([
        branchService.getBranches(organization.id),
        getInstructors(organization.id),
      ]);
      setBranches(branchesData);
      setInstructors(instructorsData);
    } catch (error) {
      console.error('Error cargando datos auxiliares:', error);
    }
  };

  useEffect(() => {
    loadClasses();
    loadBranchesAndInstructors();
  }, [organization?.id, statusFilter, typeFilter]);

  // Estadísticas calculadas
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const scheduled = classes.filter(c => c.status === 'scheduled').length;
    const inProgress = classes.filter(c => c.status === 'in_progress').length;
    const completed = classes.filter(c => c.status === 'completed').length;
    const cancelled = classes.filter(c => c.status === 'cancelled').length;
    const todayClasses = classes.filter(c => {
      const classDate = new Date(c.start_at);
      classDate.setHours(0, 0, 0, 0);
      return classDate.getTime() === today.getTime();
    }).length;
    const totalCapacity = classes.filter(c => c.status === 'scheduled').reduce((sum, c) => sum + (c.capacity || 0), 0);
    
    return { scheduled, inProgress, completed, cancelled, todayClasses, totalCapacity };
  }, [classes]);

  const filteredClasses = classes.filter((c) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      c.title?.toLowerCase().includes(search) ||
      c.description?.toLowerCase().includes(search) ||
      c.room?.toLowerCase().includes(search) ||
      c.location?.toLowerCase().includes(search)
    );
  });

  const handleNewClass = (date?: Date) => {
    setSelectedClass(null);
    setPrefilledDate(date || null);
    setShowDialog(true);
  };

  const handleEditClass = (gymClass: GymClass) => {
    setSelectedClass(gymClass);
    setShowDialog(true);
  };

  const handleSaveClass = async (data: Partial<GymClass>) => {
    try {
      if (selectedClass) {
        await updateClass(selectedClass.id, data);
        toast.success('Clase actualizada correctamente');
      } else {
        await createClass(data);
        toast.success('Clase creada correctamente');
      }
      await loadClasses();
    } catch (error) {
      console.error('Error guardando clase:', error);
      toast.error('Error al guardar la clase');
      throw error;
    }
  };

  const handleDuplicateClass = (gymClass: GymClass) => {
    setClassToDuplicate(gymClass);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDuplicateDate(tomorrow.toISOString().split('T')[0]);
    setShowDuplicateDialog(true);
  };

  const confirmDuplicate = async () => {
    if (!classToDuplicate || !duplicateDate) return;
    try {
      await duplicateClass(classToDuplicate.id, duplicateDate);
      toast.success('Clase duplicada correctamente');
      await loadClasses();
      setShowDuplicateDialog(false);
      setClassToDuplicate(null);
    } catch (error) {
      console.error('Error duplicando clase:', error);
      toast.error('Error al duplicar la clase');
    }
  };

  const handleCancelClass = (gymClass: GymClass) => {
    setClassToCancel(gymClass);
    setCancelReason('');
    setNotifyMembers(false);
    setShowCancelDialog(true);
  };

  const confirmCancel = async () => {
    if (!classToCancel || !cancelReason) return;
    try {
      await cancelClass(classToCancel.id, cancelReason, notifyMembers);
      toast.success('Clase cancelada correctamente');
      await loadClasses();
      setShowCancelDialog(false);
      setClassToCancel(null);
    } catch (error) {
      console.error('Error cancelando clase:', error);
      toast.error('Error al cancelar la clase');
    }
  };

  const handleDeleteClass = (gymClass: GymClass) => {
    setClassToDelete(gymClass);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!classToDelete) return;
    try {
      await deleteClass(classToDelete.id);
      toast.success('Clase eliminada correctamente');
      await loadClasses();
      setShowDeleteDialog(false);
      setClassToDelete(null);
    } catch (error) {
      console.error('Error eliminando clase:', error);
      toast.error('Error al eliminar la clase');
    }
  };

  const handleViewReservations = (gymClass: GymClass) => {
    router.push(`/app/gym/reservaciones?classId=${gymClass.id}`);
  };

  // Mover clase a otra fecha/hora (drag & drop)
  const handleClassMove = async (classId: number, newDate: Date, newStartHour: number) => {
    const gymClass = classes.find(c => c.id === classId);
    if (!gymClass) return;

    try {
      const originalStart = new Date(gymClass.start_at);
      const originalEnd = new Date(gymClass.end_at);
      const durationMs = originalEnd.getTime() - originalStart.getTime();

      const newStartAt = new Date(newDate);
      newStartAt.setHours(newStartHour, originalStart.getMinutes(), 0, 0);
      
      const newEndAt = new Date(newStartAt.getTime() + durationMs);

      await updateClass(classId, {
        start_at: newStartAt.toISOString(),
        end_at: newEndAt.toISOString(),
      });
      
      toast.success('Clase movida correctamente');
      await loadClasses();
    } catch (error) {
      console.error('Error moviendo clase:', error);
      toast.error('Error al mover la clase');
    }
  };

  // Redimensionar clase (cambiar duración)
  const handleClassResize = async (classId: number, newStartAt: Date, newEndAt: Date) => {
    try {
      await updateClass(classId, {
        start_at: newStartAt.toISOString(),
        end_at: newEndAt.toISOString(),
        duration_minutes: Math.round((newEndAt.getTime() - newStartAt.getTime()) / (1000 * 60)),
      });
      
      toast.success('Duración actualizada');
      await loadClasses();
    } catch (error) {
      console.error('Error redimensionando clase:', error);
      toast.error('Error al cambiar la duración');
    }
  };

  // Crear clase desde selección múltiple en el calendario
  const handleCreateFromSelection = (date: Date, startHour: number, endHour: number) => {
    const newDate = new Date(date);
    newDate.setHours(startHour, 0, 0, 0);
    setSelectedClass(null);
    setPrefilledDate(newDate);
    setShowDialog(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <ClassesHeader
        onNewClass={() => handleNewClass()}
        onRefresh={loadClasses}
        onImport={() => setShowImportDialog(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isLoading={isLoading}
      />

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.todayClasses}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Hoy</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.scheduled}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Programadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.inProgress}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">En Curso</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completed}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Completadas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.cancelled}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Canceladas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalCapacity}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cupos Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros (solo en vista lista) */}
      {viewMode === 'list' && (
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <ClassesFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              typeFilter={typeFilter}
              onTypeChange={setTypeFilter}
              onClearFilters={clearFilters}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : viewMode === 'calendar' ? (
        <ClassCalendarView
          classes={classes}
          onSelectClass={handleEditClass}
          onNewClass={handleNewClass}
          onClassMove={handleClassMove}
          onClassResize={handleClassResize}
          onCreateFromSelection={handleCreateFromSelection}
        />
      ) : filteredClasses.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-center">
              {searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No se encontraron clases con los filtros aplicados'
                : 'No hay clases programadas'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClasses.map((gymClass) => (
            <ClassCard
              key={gymClass.id}
              gymClass={gymClass}
              onEdit={handleEditClass}
              onDuplicate={handleDuplicateClass}
              onCancel={handleCancelClass}
              onDelete={handleDeleteClass}
              onViewReservations={handleViewReservations}
            />
          ))}
        </div>
      )}

      <ClassDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        gymClass={selectedClass}
        onSave={handleSaveClass}
        prefilledDate={prefilledDate}
        branches={branches}
        instructors={instructors}
      />

      <ClassImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImportComplete={loadClasses}
        branches={branches}
        instructors={instructors}
      />

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Clase</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas cancelar la clase &quot;{classToCancel?.title}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="cancel-reason">Motivo de cancelación *</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Describe el motivo de la cancelación..."
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="notify-members"
                checked={notifyMembers}
                onCheckedChange={(checked) => setNotifyMembers(checked as boolean)}
              />
              <Label htmlFor="notify-members" className="text-sm font-normal">
                Notificar a los miembros con reservación
              </Label>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={!cancelReason}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Confirmar Cancelación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Clase</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar la clase &quot;{classToDelete?.title}&quot;?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicar Clase</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona la fecha para la nueva clase duplicada de &quot;{classToDuplicate?.title}&quot;
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="duplicate-date">Nueva Fecha</Label>
            <Input
              id="duplicate-date"
              type="date"
              value={duplicateDate}
              onChange={(e) => setDuplicateDate(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDuplicate}
              disabled={!duplicateDate}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Duplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
