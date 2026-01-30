'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Users, Search, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  InstructorsHeader, 
  InstructorCard,
  InstructorDetailDialog,
  InstructorScheduleDialog,
  InstructorPerformanceDialog,
  InstructorAvailabilityDialog
} from '@/components/gym/instructores';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Instructor, GymClass, getInstructors, getClasses, getInstructorStats } from '@/lib/services/gymService';

interface InstructorWithStats extends Instructor {
  weeklyHours: number;
  weeklyClasses: number;
}

export default function InstructoresPage() {
  const { organization } = useOrganization();
  const [instructors, setInstructors] = useState<InstructorWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Estados para diálogos
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showPerformanceDialog, setShowPerformanceDialog] = useState(false);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);

  const loadInstructors = async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const [instructorsData, classesData] = await Promise.all([
        getInstructors(organization.id),
        getClasses(organization.id, { status: 'scheduled' })
      ]);

      // Calcular carga horaria semanal por instructor
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const instructorsWithStats: InstructorWithStats[] = instructorsData.map(inst => {
        const instructorClasses = classesData.filter(c => 
          c.instructor_id === inst.user_id &&
          new Date(c.start_at) >= weekStart &&
          new Date(c.start_at) < weekEnd
        );
        const weeklyMinutes = instructorClasses.reduce((sum, c) => sum + (c.duration_minutes || 60), 0);
        return {
          ...inst,
          weeklyClasses: instructorClasses.length,
          weeklyHours: Math.round(weeklyMinutes / 60 * 10) / 10
        };
      });

      setInstructors(instructorsWithStats);
    } catch (error) {
      console.error('Error cargando instructores:', error);
      toast.error('Error al cargar los instructores');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInstructors();
  }, [organization?.id]);

  // Calcular estadísticas globales
  const globalStats = useMemo(() => {
    const totalInstructors = instructors.length;
    const activeInstructors = instructors.filter(i => i.is_active).length;
    const totalClassesThisWeek = instructors.reduce((sum, i) => sum + i.weeklyClasses, 0);
    const totalHoursThisWeek = instructors.reduce((sum, i) => sum + i.weeklyHours, 0);
    
    // Promedio de asistencia (simplificado)
    const avgAttendanceRate = instructors.length > 0 ? 75 : 0; // Placeholder, se calcula después

    return {
      totalInstructors,
      activeInstructors,
      totalClassesThisWeek,
      totalHoursThisWeek: Math.round(totalHoursThisWeek * 10) / 10,
      avgAttendanceRate
    };
  }, [instructors]);

  const filteredInstructors = useMemo(() => {
    return instructors.filter((i) => {
      // Filtro por búsqueda
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          i.profiles?.first_name?.toLowerCase().includes(search) ||
          i.profiles?.last_name?.toLowerCase().includes(search) ||
          i.profiles?.email?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Filtro por estado
      if (statusFilter === 'active' && !i.is_active) return false;
      if (statusFilter === 'inactive' && i.is_active) return false;

      return true;
    });
  }, [instructors, searchTerm, statusFilter]);

  // Handlers
  const handleViewDetails = (instructor: Instructor) => {
    setSelectedInstructor(instructor);
    setShowDetailDialog(true);
  };

  const handleViewSchedule = (instructor: Instructor) => {
    setSelectedInstructor(instructor);
    setShowScheduleDialog(true);
  };

  const handleViewPerformance = (instructor: Instructor) => {
    setSelectedInstructor(instructor);
    setShowPerformanceDialog(true);
  };

  const handleManageAvailability = (instructor: Instructor) => {
    setSelectedInstructor(instructor);
    setShowAvailabilityDialog(true);
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <InstructorsHeader
        onRefresh={loadInstructors}
        isLoading={isLoading}
        stats={globalStats}
      />

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar instructor por nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de instructores */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : filteredInstructors.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-center">
              {searchTerm || statusFilter !== 'all' 
                ? 'No se encontraron instructores con los filtros aplicados' 
                : 'No hay instructores registrados'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInstructors.map((instructor) => (
            <InstructorCard
              key={instructor.id}
              instructor={instructor}
              weeklyHours={instructor.weeklyHours}
              weeklyClasses={instructor.weeklyClasses}
              onViewDetails={handleViewDetails}
              onViewSchedule={handleViewSchedule}
              onViewPerformance={handleViewPerformance}
              onManageAvailability={handleManageAvailability}
            />
          ))}
        </div>
      )}

      {/* Diálogos */}
      <InstructorDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        instructor={selectedInstructor}
      />

      <InstructorScheduleDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        instructor={selectedInstructor}
      />

      <InstructorPerformanceDialog
        open={showPerformanceDialog}
        onOpenChange={setShowPerformanceDialog}
        instructor={selectedInstructor}
      />

      <InstructorAvailabilityDialog
        open={showAvailabilityDialog}
        onOpenChange={setShowAvailabilityDialog}
        instructor={selectedInstructor}
      />
    </div>
  );
}
