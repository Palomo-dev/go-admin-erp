'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Calendar, 
  Users, 
  TrendingUp, 
  Mail, 
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3
} from 'lucide-react';
import { Instructor, getInstructorStats, getClasses, GymClass, getClassTypeLabel } from '@/lib/services/gymService';
import { useOrganization } from '@/lib/hooks/useOrganization';

interface InstructorDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor: Instructor | null;
}

interface InstructorStats {
  totalClasses: number;
  completedClasses: number;
  cancelledClasses: number;
  totalReservations: number;
  totalAttendance: number;
  avgAttendanceRate: number;
}

export function InstructorDetailDialog({ open, onOpenChange, instructor }: InstructorDetailDialogProps) {
  const { organization } = useOrganization();
  const [stats, setStats] = useState<InstructorStats | null>(null);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && instructor) {
      loadData();
    }
  }, [open, instructor]);

  const loadData = async () => {
    if (!instructor || !organization?.id) return;
    setIsLoading(true);
    try {
      const [statsData, classesData] = await Promise.all([
        getInstructorStats(instructor.user_id, organization.id),
        getClasses(organization.id, { instructorId: instructor.user_id })
      ]);
      setStats(statsData);
      setClasses(classesData);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!instructor) return null;

  const getInitials = () => {
    const first = instructor.profiles?.first_name?.[0] || '';
    const last = instructor.profiles?.last_name?.[0] || '';
    return (first + last).toUpperCase() || 'IN';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const recentClasses = classes.slice(0, 5);
  const upcomingClasses = classes.filter(c => new Date(c.start_at) > new Date() && c.status === 'scheduled').slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del Instructor</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header con info del instructor */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <Avatar className="h-20 w-20">
              <AvatarImage src={instructor.profiles?.avatar_url} />
              <AvatarFallback className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-xl">
                {getInitials()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {instructor.profiles?.first_name} {instructor.profiles?.last_name}
                </h2>
                <Badge 
                  className={instructor.is_active 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                  }
                >
                  {instructor.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>

              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {instructor.profiles?.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {instructor.profiles.email}
                  </div>
                )}
                {instructor.profiles?.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {instructor.profiles.phone}
                  </div>
                )}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <Tabs defaultValue="stats" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="stats">Estadísticas</TabsTrigger>
                <TabsTrigger value="upcoming">Próximas</TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
              </TabsList>

              <TabsContent value="stats" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Calendar className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.totalClasses || 0}</p>
                      <p className="text-xs text-gray-500">Total Clases</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-green-600">{stats?.completedClasses || 0}</p>
                      <p className="text-xs text-gray-500">Completadas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-red-600">{stats?.cancelledClasses || 0}</p>
                      <p className="text-xs text-gray-500">Canceladas</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Users className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-purple-600">{stats?.totalReservations || 0}</p>
                      <p className="text-xs text-gray-500">Reservaciones</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Users className="h-6 w-6 text-cyan-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-cyan-600">{stats?.totalAttendance || 0}</p>
                      <p className="text-xs text-gray-500">Asistentes</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <TrendingUp className="h-6 w-6 text-orange-600 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-orange-600">{(stats?.avgAttendanceRate || 0).toFixed(0)}%</p>
                      <p className="text-xs text-gray-500">Tasa Asistencia</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="upcoming" className="space-y-2">
                {upcomingClasses.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No hay clases próximas programadas</p>
                ) : (
                  upcomingClasses.map((gymClass) => (
                    <div key={gymClass.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{gymClass.title}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatDate(gymClass.start_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{getClassTypeLabel(gymClass.class_type)}</Badge>
                        <Badge className="bg-blue-100 text-blue-800">
                          {gymClass.reservations_count || 0}/{gymClass.capacity}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="history" className="space-y-2">
                {recentClasses.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No hay historial de clases</p>
                ) : (
                  recentClasses.map((gymClass) => (
                    <div key={gymClass.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{gymClass.title}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatDate(gymClass.start_at)}
                        </div>
                      </div>
                      <Badge 
                        className={
                          gymClass.status === 'completed' 
                            ? 'bg-green-100 text-green-800' 
                            : gymClass.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }
                      >
                        {gymClass.status === 'completed' ? 'Completada' : gymClass.status === 'cancelled' ? 'Cancelada' : 'Programada'}
                      </Badge>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
