'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { cn } from '@/utils/Utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Loader2,
  User,
  Briefcase,
  Building2,
  DollarSign,
  Calendar as CalendarIcon,
  Shield,
  CreditCard,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

export interface OrganizationMemberOption {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  has_employment: boolean;
}

export interface BranchOption {
  id: number;
  name: string;
}

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface PositionOption {
  id: string;
  name: string;
}

export interface ManagerOption {
  id: string;
  full_name: string;
  position_name: string | null;
}

export interface EmployeeCreateFormData {
  organization_member_id: number;
  employee_code: string;
  hire_date: string;
  probation_end_date: string;
  employment_type: string;
  contract_type: string;
  contract_end_date: string;
  position_id: string;
  department_id: string;
  manager_id: string;
  branch_id: number | null;
  base_salary: number | null;
  salary_period: string;
  currency_code: string;
  work_hours_per_week: number;
  eps_code: string;
  afp_code: string;
  arl_code: string;
  arl_risk_level: number | null;
  severance_fund_code: string;
  bank_name: string;
  bank_account_type: string;
  bank_account_number: string;
}

interface EmployeeCreateFormProps {
  onSubmit: (data: EmployeeCreateFormData) => Promise<void>;
  onCancel: () => void;
  members: OrganizationMemberOption[];
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  managers: ManagerOption[];
  isLoading?: boolean;
  validateCode?: (code: string) => Promise<boolean>;
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

export function EmployeeCreateForm({
  onSubmit,
  onCancel,
  members,
  branches,
  departments,
  positions,
  managers,
  isLoading,
  validateCode,
}: EmployeeCreateFormProps) {
  const [formData, setFormData] = useState<EmployeeCreateFormData>({
    organization_member_id: 0,
    employee_code: '',
    hire_date: format(new Date(), 'yyyy-MM-dd'),
    probation_end_date: '',
    employment_type: 'employee',
    contract_type: 'indefinite',
    contract_end_date: '',
    position_id: '',
    department_id: '',
    manager_id: '',
    branch_id: null,
    base_salary: null,
    salary_period: 'monthly',
    currency_code: 'COP',
    work_hours_per_week: 48,
    eps_code: '',
    afp_code: '',
    arl_code: '',
    arl_risk_level: null,
    severance_fund_code: '',
    bank_name: '',
    bank_account_type: '',
    bank_account_number: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [codeStatus, setCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Miembros disponibles (sin employment)
  const availableMembers = members.filter((m) => !m.has_employment);

  // Validar código único con debounce
  useEffect(() => {
    if (!formData.employee_code || formData.employee_code.length < 2) {
      setCodeStatus('idle');
      return;
    }

    const timer = setTimeout(async () => {
      if (validateCode) {
        setCodeStatus('checking');
        try {
          const isUnique = await validateCode(formData.employee_code);
          setCodeStatus(isUnique ? 'valid' : 'invalid');
          if (!isUnique) {
            setErrors((prev) => ({ ...prev, employee_code: 'Este código ya está en uso' }));
          } else {
            setErrors((prev) => {
              const { employee_code, ...rest } = prev;
              return rest;
            });
          }
        } catch {
          setCodeStatus('idle');
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.employee_code, validateCode]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.organization_member_id) {
      newErrors.organization_member_id = 'Debe seleccionar un miembro';
    }

    if (!formData.hire_date) {
      newErrors.hire_date = 'La fecha de ingreso es requerida';
    }

    if (codeStatus === 'invalid') {
      newErrors.employee_code = 'Este código ya está en uso';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setSubmitSuccess(true);
    } catch (error: any) {
      setSubmitError(error.message || 'Error al crear el empleado');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const upperValue = value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setFormData({ ...formData, employee_code: upperValue });
  };

  if (submitSuccess) {
    const selectedMember = members.find((m) => m.id === formData.organization_member_id);
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              ¡Empleado Registrado!
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {selectedMember?.full_name} ha sido registrado correctamente.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onCancel}>
                Volver a Lista
              </Button>
              <Button
                onClick={() => {
                  setFormData({
                    organization_member_id: 0,
                    employee_code: '',
                    hire_date: format(new Date(), 'yyyy-MM-dd'),
                    probation_end_date: '',
                    employment_type: 'employee',
                    contract_type: 'indefinite',
                    contract_end_date: '',
                    position_id: '',
                    department_id: '',
                    manager_id: '',
                    branch_id: null,
                    base_salary: null,
                    salary_period: 'monthly',
                    currency_code: 'COP',
                    work_hours_per_week: 48,
                    eps_code: '',
                    afp_code: '',
                    arl_code: '',
                    arl_risk_level: null,
                    severance_fund_code: '',
                    bank_name: '',
                    bank_account_type: '',
                    bank_account_number: '',
                  });
                  setSubmitSuccess(false);
                }}
              >
                Registrar Otro
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error general */}
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Paso 1: Selección de Persona */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <User className="h-5 w-5 text-blue-600" />
            Seleccionar Persona
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Selecciona un miembro de la organización para registrar como empleado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member" className="text-gray-700 dark:text-gray-300">
              Miembro <span className="text-red-500">*</span>
            </Label>
            {availableMembers.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No hay miembros disponibles. Todos los miembros ya tienen un empleo registrado.
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={formData.organization_member_id?.toString() || ''}
                onValueChange={(value) =>
                  setFormData({ ...formData, organization_member_id: parseInt(value) })
                }
              >
                <SelectTrigger
                  className={cn(
                    'bg-white dark:bg-gray-900',
                    errors.organization_member_id && 'border-red-500'
                  )}
                >
                  <SelectValue placeholder="Seleccionar miembro..." />
                </SelectTrigger>
                <SelectContent>
                  {availableMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id.toString()}>
                      <div className="flex flex-col">
                        <span>{member.full_name}</span>
                        <span className="text-xs text-gray-500">{member.email}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.organization_member_id && (
              <p className="text-xs text-red-500">{errors.organization_member_id}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employee_code" className="text-gray-700 dark:text-gray-300">
                Código de Empleado
              </Label>
              <div className="relative">
                <Input
                  id="employee_code"
                  value={formData.employee_code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="Ej: EMP-001"
                  className={cn(
                    'font-mono uppercase bg-white dark:bg-gray-900 pr-10',
                    errors.employee_code && 'border-red-500',
                    codeStatus === 'valid' && 'border-green-500'
                  )}
                  disabled={isLoading || isSubmitting}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {codeStatus === 'checking' && (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  )}
                  {codeStatus === 'valid' && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  {codeStatus === 'invalid' && (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              {errors.employee_code && (
                <p className="text-xs text-red-500">{errors.employee_code}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hire_date" className="text-gray-700 dark:text-gray-300">
                Fecha de Ingreso <span className="text-red-500">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-white dark:bg-gray-900',
                      !formData.hire_date && 'text-muted-foreground',
                      errors.hire_date && 'border-red-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.hire_date
                      ? format(new Date(formData.hire_date), 'dd/MM/yyyy')
                      : 'Seleccionar fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.hire_date ? new Date(formData.hire_date) : undefined}
                    onSelect={(date) =>
                      setFormData({
                        ...formData,
                        hire_date: date ? format(date, 'yyyy-MM-dd') : '',
                      })
                    }
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
              {errors.hire_date && (
                <p className="text-xs text-red-500">{errors.hire_date}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paso 2: Datos Laborales */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <Briefcase className="h-5 w-5 text-blue-600" />
            Datos Laborales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Tipo de Empleo</Label>
              <Select
                value={formData.employment_type}
                onValueChange={(value) => setFormData({ ...formData, employment_type: value })}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Tipo de Contrato</Label>
              <Select
                value={formData.contract_type}
                onValueChange={(value) => setFormData({ ...formData, contract_type: value })}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Departamento</Label>
              <Select
                value={formData.department_id || 'none'}
                onValueChange={(value) =>
                  setFormData({ ...formData, department_id: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Cargo</Label>
              <Select
                value={formData.position_id || 'none'}
                onValueChange={(value) =>
                  setFormData({ ...formData, position_id: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {positions.map((pos) => (
                    <SelectItem key={pos.id} value={pos.id}>
                      {pos.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Sede</Label>
              <Select
                value={formData.branch_id?.toString() || 'none'}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    branch_id: value === 'none' ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id.toString()}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Jefe Directo</Label>
            <Select
              value={formData.manager_id || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, manager_id: value === 'none' ? '' : value })
              }
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar jefe..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin jefe asignado</SelectItem>
                {managers.map((mgr) => (
                  <SelectItem key={mgr.id} value={mgr.id}>
                    {mgr.full_name} {mgr.position_name && `(${mgr.position_name})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Paso 3: Compensación */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Compensación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Salario Base</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="number"
                  value={formData.base_salary ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      base_salary: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="0"
                  className="pl-9 bg-white dark:bg-gray-900"
                  min="0"
                  step="1000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Período</Label>
              <Select
                value={formData.salary_period}
                onValueChange={(value) => setFormData({ ...formData, salary_period: value })}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SALARY_PERIODS.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Horas por Semana</Label>
              <Input
                type="number"
                value={formData.work_hours_per_week}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    work_hours_per_week: parseInt(e.target.value) || 48,
                  })
                }
                className="bg-white dark:bg-gray-900"
                min="1"
                max="168"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paso 4: Seguridad Social (Colombia) */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <Shield className="h-5 w-5 text-blue-600" />
            Seguridad Social (Colombia)
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Información de EPS, AFP, ARL y Cesantías
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">EPS</Label>
              <Input
                value={formData.eps_code}
                onChange={(e) => setFormData({ ...formData, eps_code: e.target.value })}
                placeholder="Nombre de la EPS"
                className="bg-white dark:bg-gray-900"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">AFP (Fondo de Pensiones)</Label>
              <Input
                value={formData.afp_code}
                onChange={(e) => setFormData({ ...formData, afp_code: e.target.value })}
                placeholder="Nombre del fondo"
                className="bg-white dark:bg-gray-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">ARL</Label>
              <Input
                value={formData.arl_code}
                onChange={(e) => setFormData({ ...formData, arl_code: e.target.value })}
                placeholder="Nombre de la ARL"
                className="bg-white dark:bg-gray-900"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Nivel de Riesgo ARL</Label>
              <Select
                value={formData.arl_risk_level?.toString() || 'none'}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    arl_risk_level: value === 'none' ? null : parseInt(value),
                  })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar nivel..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin definir</SelectItem>
                  {ARL_RISK_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value.toString()}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Fondo de Cesantías</Label>
            <Input
              value={formData.severance_fund_code}
              onChange={(e) => setFormData({ ...formData, severance_fund_code: e.target.value })}
              placeholder="Nombre del fondo de cesantías"
              className="bg-white dark:bg-gray-900"
            />
          </div>
        </CardContent>
      </Card>

      {/* Paso 5: Datos Bancarios */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Datos Bancarios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Banco</Label>
              <Input
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                placeholder="Nombre del banco"
                className="bg-white dark:bg-gray-900"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Tipo de Cuenta</Label>
              <Select
                value={formData.bank_account_type || 'none'}
                onValueChange={(value) =>
                  setFormData({ ...formData, bank_account_type: value === 'none' ? '' : value })
                }
              >
                <SelectTrigger className="bg-white dark:bg-gray-900">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin definir</SelectItem>
                  <SelectItem value="savings">Ahorros</SelectItem>
                  <SelectItem value="checking">Corriente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Número de Cuenta</Label>
              <Input
                value={formData.bank_account_number}
                onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                placeholder="Número de cuenta"
                className="bg-white dark:bg-gray-900"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isLoading || codeStatus === 'checking' || availableMembers.length === 0}
          className="min-w-[150px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Registrando...
            </>
          ) : (
            'Registrar Empleado'
          )}
        </Button>
      </div>
    </form>
  );
}

export default EmployeeCreateForm;
