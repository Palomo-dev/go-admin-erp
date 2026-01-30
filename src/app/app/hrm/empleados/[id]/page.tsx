'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import EmploymentsService from '@/lib/services/employmentsService';
import type { Employment } from '@/lib/services/employmentsService';
import { ShiftsService, type ShiftAssignmentListItem } from '@/lib/services/shiftsService';
import { AttendanceService, type AttendanceEventListItem } from '@/lib/services/attendanceService';
import { LeaveRequestsService, type LeaveRequest } from '@/lib/services/leaveRequestsService';
import PayrollService, { type PayrollSlip } from '@/lib/services/payrollService';
import EmployeeLoansService, { type EmployeeLoan } from '@/lib/services/employeeLoansService';
import { format, subDays, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EmployeeHeader,
  EmployeeInfo,
  EmployeeSocialSecurity,
} from '@/components/hrm/empleados/detail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  AlertTriangle,
  User,
  Briefcase,
  Shield,
  Clock,
  Calendar,
  FileText,
  Wallet,
  CreditCard,
} from 'lucide-react';
import Link from 'next/link';

export default function EmpleadoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [employee, setEmployee] = useState<Employment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState('info');

  // Estado para diálogo de terminación
  const [terminationDialog, setTerminationDialog] = useState(false);
  const [terminationReason, setTerminationReason] = useState('');
  const [terminationType, setTerminationType] = useState('voluntary');

  // Estados para datos de tabs
  const [shifts, setShifts] = useState<ShiftAssignmentListItem[]>([]);
  const [attendance, setAttendance] = useState<AttendanceEventListItem[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payrollSlips, setPayrollSlips] = useState<PayrollSlip[]>([]);
  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new EmploymentsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service || !employeeId) return;

    setIsLoading(true);
    try {
      const empData = await service.getById(employeeId);

      if (!empData) {
        setNotFound(true);
        return;
      }

      setEmployee(empData);
    } catch (error) {
      console.error('Error loading employee:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el empleado',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, employeeId, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && employeeId) {
      loadData();
    }
  }, [organization?.id, orgLoading, employeeId, loadData]);

  // Cargar datos de tabs cuando cambia el tab activo
  const loadTabData = useCallback(async (tab: string) => {
    if (!organization?.id || !employeeId) return;

    setTabsLoading(true);
    const today = new Date();
    const dateFrom = format(subDays(today, 30), 'yyyy-MM-dd');
    const dateTo = format(addDays(today, 30), 'yyyy-MM-dd');

    try {
      switch (tab) {
        case 'schedule': {
          const shiftsService = new ShiftsService(organization.id);
          const shiftsData = await shiftsService.getAssignments({
            employmentId: employeeId,
            dateFrom,
            dateTo,
          });
          setShifts(shiftsData);
          break;
        }
        case 'attendance': {
          const attendanceService = new AttendanceService(organization.id);
          const attendanceData = await attendanceService.getEvents({
            employmentId: employeeId,
            dateFrom: format(subDays(today, 30), 'yyyy-MM-dd'),
            dateTo: format(today, 'yyyy-MM-dd'),
          });
          setAttendance(attendanceData);
          break;
        }
        case 'leaves': {
          const leavesService = new LeaveRequestsService(organization.id);
          const leavesData = await leavesService.getAll({
            employmentId: employeeId,
          });
          setLeaves(leavesData);
          break;
        }
        case 'payroll': {
          const payrollService = new PayrollService(organization.id);
          const slipsData = await payrollService.getSlips({
            employment_id: employeeId,
          });
          setPayrollSlips(slipsData);
          break;
        }
        case 'loans': {
          const loansService = new EmployeeLoansService(organization.id);
          const loansData = await loansService.getAll({
            employment_id: employeeId,
          });
          setLoans(loansData);
          break;
        }
      }
    } catch (error) {
      console.error(`Error loading ${tab} data:`, error);
    } finally {
      setTabsLoading(false);
    }
  }, [organization?.id, employeeId]);

  // Cargar datos cuando cambia el tab
  useEffect(() => {
    if (employee && ['schedule', 'attendance', 'leaves', 'payroll', 'loans'].includes(activeTab)) {
      loadTabData(activeTab);
    }
  }, [activeTab, employee, loadTabData]);

  // Handlers
  const handleEdit = () => {
    router.push(`/app/hrm/empleados/${employeeId}/editar`);
  };

  const handleChangeStatus = async (newStatus: string) => {
    const service = getService();
    if (!service || !employee) return;

    if (newStatus === 'terminated') {
      setTerminationDialog(true);
      return;
    }

    try {
      await service.updateStatus(employee.id, newStatus);
      toast({
        title: 'Estado actualizado',
        description: `${employee.full_name} ahora está ${getStatusLabel(newStatus)}`,
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

  const handleTerminate = async () => {
    const service = getService();
    if (!service || !employee) return;

    try {
      await service.updateStatus(employee.id, 'terminated', {
        terminationReason,
        terminationType,
      });
      toast({
        title: 'Contrato terminado',
        description: `Se terminó el contrato de ${employee.full_name}`,
      });
      setTerminationDialog(false);
      setTerminationReason('');
      setTerminationType('voluntary');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo terminar el contrato',
        variant: 'destructive',
      });
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: 'activo',
      probation: 'en período de prueba',
      suspended: 'suspendido',
      terminated: 'con contrato terminado',
    };
    return labels[status] || status;
  };

  // Loading state
  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Not found state
  if (notFound || !employee) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="h-16 w-16 text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Empleado no encontrado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            El empleado que buscas no existe o no tienes acceso.
          </p>
          <Link href="/app/hrm/empleados">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Empleados
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/app/hrm" className="hover:text-blue-600 dark:hover:text-blue-400">
          HRM
        </Link>
        <span>/</span>
        <Link href="/app/hrm/empleados" className="hover:text-blue-600 dark:hover:text-blue-400">
          Empleados
        </Link>
        <span>/</span>
        <span className="text-gray-900 dark:text-white">{employee.full_name}</span>
      </nav>

      {/* Header */}
      <EmployeeHeader
        employee={{
          id: employee.id,
          full_name: employee.full_name || 'Sin nombre',
          email: employee.email || null,
          phone: employee.phone || null,
          avatar_url: employee.avatar_url || null,
          employee_code: employee.employee_code,
          status: employee.status,
          position_name: employee.position_name || null,
          department_name: employee.department_name || null,
          branch_name: employee.branch_name || null,
          hire_date: employee.hire_date,
        }}
        onEdit={handleEdit}
        onChangeStatus={handleChangeStatus}
      />

      {/* Tabs de Contenido */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white dark:bg-gray-800 p-1">
          <TabsTrigger value="info" className="gap-2">
            <User className="h-4 w-4" />
            Información
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Seguridad Social
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2">
            <Calendar className="h-4 w-4" />
            Turnos
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <Clock className="h-4 w-4" />
            Asistencia
          </TabsTrigger>
          <TabsTrigger value="leaves" className="gap-2">
            <FileText className="h-4 w-4" />
            Ausencias
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-2">
            <Wallet className="h-4 w-4" />
            Nómina
          </TabsTrigger>
          <TabsTrigger value="loans" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Préstamos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6">
          <EmployeeInfo
            employee={{
              employment_type: employee.employment_type,
              contract_type: employee.contract_type,
              contract_end_date: employee.contract_end_date,
              hire_date: employee.hire_date,
              probation_end_date: employee.probation_end_date,
              position_name: employee.position_name || null,
              department_name: employee.department_name || null,
              branch_name: employee.branch_name || null,
              manager_name: employee.manager_name || null,
              base_salary: employee.base_salary,
              salary_period: employee.salary_period,
              currency_code: employee.currency_code,
              work_hours_per_week: employee.work_hours_per_week,
              work_location: employee.work_location,
            }}
          />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <EmployeeSocialSecurity
            employee={{
              eps_code: employee.eps_code,
              afp_code: employee.afp_code,
              arl_code: employee.arl_code,
              arl_risk_level: employee.arl_risk_level,
              severance_fund_code: employee.severance_fund_code,
              bank_name: employee.bank_name,
              bank_account_type: employee.bank_account_type,
              bank_account_number: employee.bank_account_number,
            }}
          />
        </TabsContent>

        <TabsContent value="schedule">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Turnos y Horarios (próximos 30 días)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tabsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : shifts.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p>No hay turnos programados</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Horario</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((shift) => (
                      <TableRow key={shift.id}>
                        <TableCell>{format(new Date(shift.work_date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {shift.template_color && (
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: shift.template_color }} />
                            )}
                            {shift.template_name || 'Sin asignar'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {shift.template_start_time && shift.template_end_time
                            ? `${shift.template_start_time.slice(0, 5)} - ${shift.template_end_time.slice(0, 5)}`
                            : '-'}
                        </TableCell>
                        <TableCell>{shift.branch_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={shift.status === 'completed' ? 'default' : shift.status === 'cancelled' ? 'destructive' : 'secondary'}>
                            {shift.status === 'scheduled' ? 'Programado' : shift.status === 'completed' ? 'Completado' : shift.status === 'cancelled' ? 'Cancelado' : shift.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Marcaciones (últimos 30 días)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tabsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : attendance.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p>No hay marcaciones registradas</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha/Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fuente</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Ubicación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{format(new Date(event.event_at), 'dd/MM/yyyy HH:mm', { locale: es })}</TableCell>
                        <TableCell>
                          <Badge variant={event.event_type === 'check_in' ? 'default' : event.event_type === 'check_out' ? 'secondary' : 'outline'}>
                            {event.event_type === 'check_in' ? 'Entrada' : event.event_type === 'check_out' ? 'Salida' : event.event_type === 'break_start' ? 'Inicio Descanso' : event.event_type === 'break_end' ? 'Fin Descanso' : event.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="capitalize">{event.source === 'qr' ? 'QR' : event.source === 'manual' ? 'Manual' : event.source === 'geo' ? 'Geo' : event.source}</span>
                        </TableCell>
                        <TableCell>{event.branch_name || '-'}</TableCell>
                        <TableCell>
                          {event.geo_validated === true ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">Validada</Badge>
                          ) : event.geo_validated === false ? (
                            <Badge variant="destructive">Fuera de zona</Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Ausencias y Licencias
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tabsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : leaves.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p>No hay solicitudes de ausencia</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha Inicio</TableHead>
                      <TableHead>Fecha Fin</TableHead>
                      <TableHead>Días</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.map((leave) => (
                      <TableRow key={leave.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {leave.leave_type_color && (
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: leave.leave_type_color }} />
                            )}
                            {leave.leave_type_name}
                          </div>
                        </TableCell>
                        <TableCell>{format(new Date(leave.start_date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                        <TableCell>{format(new Date(leave.end_date), 'dd/MM/yyyy', { locale: es })}</TableCell>
                        <TableCell>{leave.total_days}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={leave.status === 'approved' ? 'default' : leave.status === 'rejected' ? 'destructive' : leave.status === 'cancelled' ? 'outline' : 'secondary'}
                            className={leave.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                          >
                            {leave.status === 'requested' ? 'Solicitada' : leave.status === 'approved' ? 'Aprobada' : leave.status === 'rejected' ? 'Rechazada' : leave.status === 'cancelled' ? 'Cancelada' : leave.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-600" />
                Historial de Nómina
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tabsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : payrollSlips.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Wallet className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p>No hay registros de nómina</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Corrida</TableHead>
                      <TableHead className="text-right">Salario Bruto</TableHead>
                      <TableHead className="text-right">Deducciones</TableHead>
                      <TableHead className="text-right">Neto</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollSlips.map((slip) => (
                      <TableRow key={slip.id}>
                        <TableCell>{slip.period_name || '-'}</TableCell>
                        <TableCell>#{slip.run_number || '-'}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${slip.gross_pay?.toLocaleString('es-CO') || '0'}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          -${slip.total_deductions?.toLocaleString('es-CO') || '0'}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          ${slip.net_pay?.toLocaleString('es-CO') || '0'}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={slip.status === 'paid' ? 'default' : slip.status === 'approved' ? 'secondary' : 'outline'}
                            className={slip.status === 'paid' ? 'bg-green-100 text-green-800' : ''}
                          >
                            {slip.status === 'draft' ? 'Borrador' : slip.status === 'calculated' ? 'Calculado' : slip.status === 'approved' ? 'Aprobado' : slip.status === 'paid' ? 'Pagado' : slip.status || '-'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loans">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                Préstamos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tabsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : loans.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p>No hay préstamos registrados</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Cuotas</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell className="font-medium">{loan.loan_number || '-'}</TableCell>
                        <TableCell>{loan.loan_type || 'General'}</TableCell>
                        <TableCell className="text-right">
                          ${loan.total_amount?.toLocaleString('es-CO') || '0'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${loan.balance?.toLocaleString('es-CO') || '0'}
                        </TableCell>
                        <TableCell>
                          {loan.installments_paid || 0}/{loan.installments_total || 0}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={loan.status === 'paid' ? 'default' : loan.status === 'active' ? 'secondary' : loan.status === 'cancelled' ? 'outline' : loan.status === 'defaulted' ? 'destructive' : 'outline'}
                            className={loan.status === 'paid' ? 'bg-green-100 text-green-800' : loan.status === 'active' ? 'bg-blue-100 text-blue-800' : loan.status === 'requested' ? 'bg-amber-100 text-amber-800' : ''}
                          >
                            {loan.status === 'requested' ? 'Solicitado' : loan.status === 'approved' ? 'Aprobado' : loan.status === 'active' ? 'Activo' : loan.status === 'paid' ? 'Pagado' : loan.status === 'cancelled' ? 'Cancelado' : loan.status === 'defaulted' ? 'En mora' : loan.status || '-'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo de Terminación */}
      <Dialog open={terminationDialog} onOpenChange={setTerminationDialog}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Terminar Contrato
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Estás terminando el contrato de <strong>{employee.full_name}</strong>.
              Esta acción es irreversible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="terminationType">Tipo de terminación</Label>
              <Select value={terminationType} onValueChange={setTerminationType}>
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voluntary">Voluntaria (Renuncia)</SelectItem>
                  <SelectItem value="involuntary">Involuntaria (Despido)</SelectItem>
                  <SelectItem value="contract_end">Fin de contrato</SelectItem>
                  <SelectItem value="mutual_agreement">Mutuo acuerdo</SelectItem>
                  <SelectItem value="retirement">Jubilación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="terminationReason">Motivo</Label>
              <Textarea
                id="terminationReason"
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
                placeholder="Describe el motivo de la terminación..."
                rows={3}
                className="bg-white dark:bg-gray-900"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminationDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleTerminate}>
              Confirmar Terminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
