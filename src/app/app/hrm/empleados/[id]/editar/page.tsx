'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import EmploymentsService from '@/lib/services/employmentsService';
import type { Employment } from '@/lib/services/employmentsService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  Edit3,
  Briefcase,
  DollarSign,
  Shield,
  CreditCard,
  Calendar as CalendarIcon,
  Loader2,
  AlertCircle,
  CheckCircle,
  Save,
} from 'lucide-react';
import Link from 'next/link';

interface BranchOption {
  id: number;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface PositionOption {
  id: string;
  name: string;
}

interface ManagerOption {
  id: string;
  full_name: string;
  position_name: string | null;
}

const EMPLOYMENT_TYPES = [
  { value: 'employee', label: 'Empleado' },
  { value: 'contractor', label: 'Contratista' },
  { value: 'intern', label: 'Practicante' },
  { value: 'temporary', label: 'Temporal' },
];

const CONTRACT_TYPES = [
  { value: 'indefinite', label: 'Indefinido' },
  { value: 'fixed_term', label: 'Término fijo' },
  { value: 'temporary', label: 'Temporal' },
  { value: 'internship', label: 'Pasantía' },
  { value: 'freelance', label: 'Freelance' },
];

const SALARY_PERIODS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'hourly', label: 'Por hora' },
];

const ARL_RISK_LEVELS = [
  { value: 1, label: 'Nivel I - Riesgo Mínimo' },
  { value: 2, label: 'Nivel II - Riesgo Bajo' },
  { value: 3, label: 'Nivel III - Riesgo Medio' },
  { value: 4, label: 'Nivel IV - Riesgo Alto' },
  { value: 5, label: 'Nivel V - Riesgo Máximo' },
];

export default function EditarEmpleadoPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [employee, setEmployee] = useState<Employment | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [codeStatus, setCo] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');

  // Form data
  const [formData, setFormData] = useState({
    employee_code: '',
    hire_date: '',
    probation_end_date: '',
    employment_type: 'employee',
    contract_type: '',
    contract_end_date: '',
    position_id: '',
    department_id: '',
    manager_id: '',
    branch_id: null as number | null,
    base_salary: null as number | null,
    salary_period: 'monthly',
    currency_code: 'COP',
    work_hours_per_week: 48,
    eps_code: '',
    afp_code: '',
    arl_code: '',
    arl_risk_level: null as number | null,
    severance_fund_code: '',
    bank_name: '',
    bank_account_type: '',
    bank_account_number: '',
  });

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
      const [empData, branchData, deptData, posData, mgrData] = await Promise.all([
        service.getById(employeeId),
        service.getBranches(),
        service.getDepartments(),
        service.getPositions(),
        service.getManagers(),
      ]);

      if (!empData) {
        setNotFound(true);
        return;
      }

      setEmployee(empData);
      setBranches(branchData);
      setDepartments(deptData);
      setPositions(posData);
      setManagers(mgrData.filter((m) => m.id !== employeeId)); // Excluir a sí mismo

      // Inicializar form data
      setFormData({
        employee_code: empData.employee_code || '',
        hire_date: empData.hire_date,
        probation_end_date: empData.probation_end_date || '',
        employment_type: empData.employment_type,
        contract_type: empData.contract_type || '',
        contract_end_date: empData.contract_end_date || '',
        position_id: empData.position_id || '',
        department_id: empData.department_id || '',
        manager_id: empData.manager_id || '',
        branch_id: empData.branch_id,
        base_salary: empData.base_salary,
        salary_period: empData.salary_period,
        currency_code: empData.currency_code,
        work_hours_per_week: empData.work_hours_per_week,
        eps_code: empData.eps_code || '',
        afp_code: empData.afp_code || '',
        arl_code: empData.arl_code || '',
        arl_risk_level: empData.arl_risk_level,
        severance_fund_code: empData.severance_fund_code || '',
        bank_name: empData.bank_name || '',
        bank_account_type: empData.bank_account_type || '',
        bank_account_number: empData.bank_account_number || '',
      });
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

  // Validar código único con debounce
  useEffect(() => {
    const originalCode = employee?.employee_code || '';
    if (!formData.employee_code || formData.employee_code.length < 2 || formData.employee_code === originalCode) {
      setCo('idle');
      return;
    }

    const timer = setTimeout(async () => {
      const service = getService();
      if (service) {
        setCo('checking');
        try {
          const isUnique = await service.validateEmployeeCode(formData.employee_code, employeeId);
          setCo(isUnique ? 'valid' : 'invalid');
        } catch {
          setCo('idle');
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.employee_code, employee?.employee_code, employeeId, getService]);

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (codeStatus === 'invalid') {
      setSubmitError('El código de empleado ya está en uso');
      return;
    }

    const service = getService();
    if (!service) return;

    setIsSubmitting(true);
    try {
      await service.update(employeeId, {
        employee_code: formData.employee_code || undefined,
        hire_date: formData.hire_date,
        probation_end_date: formData.probation_end_date || null,
        employment_type: formData.employment_type,
        contract_type: formData.contract_type || null,
        contract_end_date: formData.contract_end_date || null,
        position_id: formData.position_id || null,
        department_id: formData.department_id || null,
        manager_id: formData.manager_id || null,
        branch_id: formData.branch_id,
        base_salary: formData.base_salary,
        salary_period: formData.salary_period,
        currency_code: formData.currency_code,
        work_hours_per_week: formData.work_hours_per_week,
        eps_code: formData.eps_code || null,
        afp_code: formData.afp_code || null,
        arl_code: formData.arl_code || null,
        arl_risk_level: formData.arl_risk_level,
        severance_fund_code: formData.severance_fund_code || null,
        bank_name: formData.bank_name || null,
        bank_account_type: formData.bank_account_type || null,
        bank_account_number: formData.bank_account_number || null,
      });

      toast({
        title: 'Empleado actualizado',
        description: 'Los cambios se guardaron correctamente',
      });

      router.push(`/app/hrm/empleados/${employeeId}`);
    } catch (error: any) {
      setSubmitError(error.message || 'Error al guardar los cambios');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const upperValue = value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setFormData({ ...formData, employee_code: upperValue });
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !employee) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="max-w-4xl mx-auto text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Empleado no encontrado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            El empleado que intentas editar no existe o no tienes permisos.
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
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/app/hrm/empleados/${employeeId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-blue-600" />
                Editar Empleado
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Modifica los datos de &quot;{employee.full_name}&quot;
              </p>
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/app/hrm" className="hover:text-blue-600">HRM</Link>
            <span>/</span>
            <Link href="/app/hrm/empleados" className="hover:text-blue-600">Empleados</Link>
            <span>/</span>
            <Link href={`/app/hrm/empleados/${employeeId}`} className="hover:text-blue-600">
              {employee.full_name}
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">Editar</span>
          </nav>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error general */}
          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Datos Básicos */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                <Briefcase className="h-5 w-5 text-blue-600" />
                Datos Laborales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Código de Empleado</Label>
                  <div className="relative">
                    <Input
                      value={formData.employee_code}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      placeholder="EMP-001"
                      className={cn(
                        'font-mono uppercase bg-white dark:bg-gray-900 pr-10',
                        codeStatus === 'valid' && 'border-green-500',
                        codeStatus === 'invalid' && 'border-red-500'
                      )}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {codeStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                      {codeStatus === 'valid' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {codeStatus === 'invalid' && <AlertCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Fecha de Ingreso</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start bg-white dark:bg-gray-900">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.hire_date ? format(new Date(formData.hire_date), 'dd/MM/yyyy') : 'Seleccionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.hire_date ? new Date(formData.hire_date) : undefined}
                        onSelect={(date: Date | undefined) => setFormData({ ...formData, hire_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Empleo</Label>
                  <Select value={formData.employment_type} onValueChange={(v) => setFormData({ ...formData, employment_type: v })}>
                    <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Contrato</Label>
                  <Select value={formData.contract_type || 'none'} onValueChange={(v) => setFormData({ ...formData, contract_type: v === 'none' ? '' : v })}>
                    <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin definir</SelectItem>
                      {CONTRACT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Departamento</Label>
                  <Select value={formData.department_id || 'none'} onValueChange={(v) => setFormData({ ...formData, department_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Select value={formData.position_id || 'none'} onValueChange={(v) => setFormData({ ...formData, position_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sede</Label>
                  <Select value={formData.branch_id?.toString() || 'none'} onValueChange={(v) => setFormData({ ...formData, branch_id: v === 'none' ? null : parseInt(v) })}>
                    <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {branches.map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Jefe Directo</Label>
                <Select value={formData.manager_id || 'none'} onValueChange={(v) => setFormData({ ...formData, manager_id: v === 'none' ? '' : v })}>
                  <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin jefe asignado</SelectItem>
                    {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name} {m.position_name && `(${m.position_name})`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Compensación */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                <DollarSign className="h-5 w-5 text-blue-600" />
                Compensación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Salario Base</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="number"
                      value={formData.base_salary ?? ''}
                      onChange={(e) => setFormData({ ...formData, base_salary: e.target.value ? parseFloat(e.target.value) : null })}
                      className="pl-9 bg-white dark:bg-gray-900"
                      min="0"
                      step="1000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Período</Label>
                  <Select value={formData.salary_period} onValueChange={(v) => setFormData({ ...formData, salary_period: v })}>
                    <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SALARY_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Horas por Semana</Label>
                  <Input
                    type="number"
                    value={formData.work_hours_per_week}
                    onChange={(e) => setFormData({ ...formData, work_hours_per_week: parseInt(e.target.value) || 48 })}
                    className="bg-white dark:bg-gray-900"
                    min="1"
                    max="168"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seguridad Social */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                <Shield className="h-5 w-5 text-blue-600" />
                Seguridad Social (Colombia)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>EPS</Label>
                  <Input value={formData.eps_code} onChange={(e) => setFormData({ ...formData, eps_code: e.target.value })} className="bg-white dark:bg-gray-900" />
                </div>
                <div className="space-y-2">
                  <Label>AFP (Fondo de Pensiones)</Label>
                  <Input value={formData.afp_code} onChange={(e) => setFormData({ ...formData, afp_code: e.target.value })} className="bg-white dark:bg-gray-900" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ARL</Label>
                  <Input value={formData.arl_code} onChange={(e) => setFormData({ ...formData, arl_code: e.target.value })} className="bg-white dark:bg-gray-900" />
                </div>
                <div className="space-y-2">
                  <Label>Nivel de Riesgo ARL</Label>
                  <Select value={formData.arl_risk_level?.toString() || 'none'} onValueChange={(v) => setFormData({ ...formData, arl_risk_level: v === 'none' ? null : parseInt(v) })}>
                    <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin definir</SelectItem>
                      {ARL_RISK_LEVELS.map((l) => <SelectItem key={l.value} value={l.value.toString()}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fondo de Cesantías</Label>
                <Input value={formData.severance_fund_code} onChange={(e) => setFormData({ ...formData, severance_fund_code: e.target.value })} className="bg-white dark:bg-gray-900" />
              </div>
            </CardContent>
          </Card>

          {/* Datos Bancarios */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                <CreditCard className="h-5 w-5 text-blue-600" />
                Datos Bancarios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Input value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} className="bg-white dark:bg-gray-900" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Cuenta</Label>
                  <Select value={formData.bank_account_type || 'none'} onValueChange={(v) => setFormData({ ...formData, bank_account_type: v === 'none' ? '' : v })}>
                    <SelectTrigger className="bg-white dark:bg-gray-900"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin definir</SelectItem>
                      <SelectItem value="savings">Ahorros</SelectItem>
                      <SelectItem value="checking">Corriente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Número de Cuenta</Label>
                  <Input value={formData.bank_account_number} onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })} className="bg-white dark:bg-gray-900" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => router.push(`/app/hrm/empleados/${employeeId}`)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || codeStatus === 'checking'} className="min-w-[150px]">
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />Guardar Cambios</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
