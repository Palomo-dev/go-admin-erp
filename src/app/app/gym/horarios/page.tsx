'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Filter, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScheduleHeader, WeeklyCalendar } from '@/components/gym/horarios';
import { ClassDialog } from '@/components/gym/clases';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { branchService } from '@/lib/services/branchService';
import {
  GymClass,
  Instructor,
  getClasses,
  getInstructors,
  createClass,
  updateClass,
} from '@/lib/services/gymService';
import { Branch } from '@/types/branch';

export default function HorariosPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Filtros
  const [typeFilter, setTypeFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [instructorFilter, setInstructorFilter] = useState('all');
  
  // Datos para filtros
  const [branches, setBranches] = useState<Branch[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  
  // Estado para crear/editar clase
  const [showClassDialog, setShowClassDialog] = useState(false);
  const [selectedClass, setSelectedClass] = useState<GymClass | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<Date | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const { weekStart, weekEnd } = useMemo(() => {
    const start = getWeekStart(currentDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { weekStart: start, weekEnd: end };
  }, [currentDate]);

  // Cargar datos iniciales (sedes e instructores)
  const loadInitialData = useCallback(async () => {
    if (!organization?.id) return;
    try {
      const [branchesData, instructorsData] = await Promise.all([
        branchService.getBranches(organization.id),
        getInstructors(organization.id),
      ]);
      setBranches(branchesData);
      setInstructors(instructorsData);
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
    }
  }, [organization?.id]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Convertir fechas a string para dependencias estables
  const weekStartISO = weekStart.toISOString();
  const weekEndISO = weekEnd.toISOString();

  const loadClasses = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const data = await getClasses(organization.id, {
        dateFrom: weekStartISO,
        dateTo: weekEndISO,
        classType: typeFilter !== 'all' ? typeFilter : undefined,
        branchId: branchFilter !== 'all' ? parseInt(branchFilter) : undefined,
        instructorId: instructorFilter !== 'all' ? instructorFilter : undefined,
      });
      setClasses(data);
    } catch (error) {
      console.error('Error cargando clases:', error);
      toast.error('Error al cargar el horario');
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, weekStartISO, weekEndISO, typeFilter, branchFilter, instructorFilter]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleClassClick = (gymClass: GymClass) => {
    setSelectedClass(gymClass);
    setPrefilledDate(null);
    setShowClassDialog(true);
  };

  // Crear clase desde slot vacío del calendario
  const handleSlotClick = (date: Date, hour: number) => {
    const newDate = new Date(date);
    newDate.setHours(hour, 0, 0, 0);
    setSelectedClass(null);
    setPrefilledDate(newDate);
    setShowClassDialog(true);
  };

  // Nueva clase desde botón
  const handleNewClass = () => {
    setSelectedClass(null);
    setPrefilledDate(new Date());
    setShowClassDialog(true);
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setBranchFilter('all');
    setInstructorFilter('all');
  };

  // Mover clase a otra fecha/hora (drag & drop)
  const handleClassMove = async (classId: number, newDate: Date, newStartHour: number) => {
    const gymClass = classes.find(c => c.id === classId);
    if (!gymClass) return;

    try {
      // Calcular duración original
      const originalStart = new Date(gymClass.start_at);
      const originalEnd = new Date(gymClass.end_at);
      const durationMs = originalEnd.getTime() - originalStart.getTime();

      // Nueva hora de inicio
      const newStartAt = new Date(newDate);
      newStartAt.setHours(newStartHour, originalStart.getMinutes(), 0, 0);
      
      // Nueva hora de fin (mantener duración)
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

  // Redimensionar clase (cambiar hora inicio/fin)
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
    
    // Calcular duración basada en la selección
    const durationMinutes = (endHour - startHour) * 60;
    
    setSelectedClass(null);
    setPrefilledDate(newDate);
    setShowClassDialog(true);
    
    // Nota: La duración se pasa a través del prefilledDate
    // El ClassDialog calculará el end_time automáticamente
  };

  const handleSaveClass = async (data: Partial<GymClass>) => {
    try {
      if (selectedClass) {
        await updateClass(selectedClass.id, data);
        toast.success('Clase actualizada');
      } else {
        await createClass(data);
        toast.success('Clase creada');
      }
      await loadClasses();
    } catch (error) {
      console.error('Error guardando clase:', error);
      toast.error('Error al guardar');
      throw error;
    }
  };

  const CLASS_TYPES = [
    { value: 'all', label: 'Todos los tipos' },
    { value: 'spinning', label: 'Spinning' },
    { value: 'yoga', label: 'Yoga' },
    { value: 'pilates', label: 'Pilates' },
    { value: 'crossfit', label: 'CrossFit' },
    { value: 'zumba', label: 'Zumba' },
    { value: 'boxing', label: 'Boxeo' },
    { value: 'functional', label: 'Funcional' },
    { value: 'aerobics', label: 'Aeróbicos' },
    { value: 'stretching', label: 'Estiramiento' },
    { value: 'hiit', label: 'HIIT' },
    { value: 'dance', label: 'Baile' },
  ];

  const hasActiveFilters = typeFilter !== 'all' || branchFilter !== 'all' || instructorFilter !== 'all';

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <ScheduleHeader
        currentDate={currentDate}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
        onRefresh={loadClasses}
        onNewClass={handleNewClass}
        isLoading={isLoading}
      />

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600"
            >
              <Filter className="h-4 w-4" />
              Filtros
              {hasActiveFilters && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                  Activos
                </span>
              )}
            </button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            )}
          </div>
          
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Filtro por Sede */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Sede</Label>
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las sedes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las sedes</SelectItem>
                    {branches.filter(b => b.id).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id!.toString()}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por Tipo */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Tipo de clase</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASS_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por Instructor */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Instructor</Label>
                <Select value={instructorFilter} onValueChange={setInstructorFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los instructores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los instructores</SelectItem>
                    {instructors.map((instructor) => (
                      <SelectItem key={instructor.user_id} value={instructor.user_id}>
                        {instructor.profiles?.first_name} {instructor.profiles?.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <WeeklyCalendar
          classes={classes}
          weekStart={weekStart}
          onClassClick={handleClassClick}
          onSlotClick={handleSlotClick}
          onClassMove={handleClassMove}
          onClassResize={handleClassResize}
          onCreateFromSelection={handleCreateFromSelection}
        />
      )}

      <ClassDialog
        open={showClassDialog}
        onOpenChange={setShowClassDialog}
        gymClass={selectedClass}
        onSave={handleSaveClass}
        prefilledDate={prefilledDate}
        branches={branches}
        instructors={instructors}
      />
    </div>
  );
}
