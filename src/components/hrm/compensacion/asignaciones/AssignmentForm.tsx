'use client';

import { useState, useEffect } from 'react';
import type { EmploymentCompensation, CreateAssignmentDTO, UpdateAssignmentDTO } from '@/lib/services/employmentCompensationService';
import { formatCurrency } from '@/utils/Utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Save, X, Loader2 } from 'lucide-react';

interface AssignmentFormProps {
  assignment?: EmploymentCompensation | null;
  employees: { id: string; name: string; code: string | null }[];
  packages: { id: string; name: string; base_salary: number | null; currency_code: string }[];
  statuses: { value: string; label: string }[];
  onSubmit: (data: CreateAssignmentDTO | UpdateAssignmentDTO) => Promise<void>;
  onCancel: () => void;
}

export function AssignmentForm({
  assignment,
  employees,
  packages,
  statuses,
  onSubmit,
  onCancel,
}: AssignmentFormProps) {
  const [formData, setFormData] = useState<CreateAssignmentDTO>({
    employment_id: '',
    package_id: '',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    salary_override: undefined,
    notes: '',
    status: 'active',
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<typeof packages[0] | null>(null);

  useEffect(() => {
    if (assignment) {
      setFormData({
        employment_id: assignment.employment_id,
        package_id: assignment.package_id,
        effective_from: assignment.effective_from,
        effective_to: assignment.effective_to || '',
        salary_override: assignment.salary_override || undefined,
        notes: assignment.notes || '',
        status: assignment.status || 'active',
      });
      const pkg = packages.find(p => p.id === assignment.package_id);
      setSelectedPackage(pkg || null);
    }
  }, [assignment, packages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employment_id || !formData.package_id || !formData.effective_from) return;

    setSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        effective_to: formData.effective_to || undefined,
        salary_override: formData.salary_override || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof CreateAssignmentDTO, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    
    if (field === 'package_id') {
      const pkg = packages.find(p => p.id === value);
      setSelectedPackage(pkg || null);
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <UserPlus className="h-5 w-5 text-blue-600" />
          {assignment ? 'Editar Asignación' : 'Nueva Asignación de Compensación'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Employee & Package */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employment_id" className="text-gray-700 dark:text-gray-300">
                Empleado *
              </Label>
              <Select
                value={formData.employment_id}
                onValueChange={(value) => handleChange('employment_id', value)}
                disabled={!!assignment}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar empleado" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 max-h-60">
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} {emp.code ? `(${emp.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="package_id" className="text-gray-700 dark:text-gray-300">
                Paquete de Compensación *
              </Label>
              <Select
                value={formData.package_id}
                onValueChange={(value) => handleChange('package_id', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar paquete" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 max-h-60">
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name}
                      {pkg.base_salary ? ` - ${formatCurrency(pkg.base_salary, pkg.currency_code)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Package Info */}
          {selectedPackage && (
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Paquete seleccionado:</strong> {selectedPackage.name}
              </div>
              {selectedPackage.base_salary && (
                <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Salario base: {formatCurrency(selectedPackage.base_salary, selectedPackage.currency_code)}
                </div>
              )}
            </div>
          )}

          {/* Salary Override */}
          <div className="space-y-2">
            <Label htmlFor="salary_override" className="text-gray-700 dark:text-gray-300">
              Salario Override (opcional)
            </Label>
            <Input
              id="salary_override"
              type="number"
              value={formData.salary_override || ''}
              onChange={(e) => handleChange('salary_override', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Dejar vacío para usar el salario del paquete"
              min="0"
              step="0.01"
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Si se especifica, este valor reemplazará el salario base del paquete para este empleado.
            </p>
          </div>

          {/* Dates & Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="effective_from" className="text-gray-700 dark:text-gray-300">
                Vigencia desde *
              </Label>
              <Input
                id="effective_from"
                type="date"
                value={formData.effective_from}
                onChange={(e) => handleChange('effective_from', e.target.value)}
                required
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effective_to" className="text-gray-700 dark:text-gray-300">
                Vigencia hasta
              </Label>
              <Input
                id="effective_to"
                type="date"
                value={formData.effective_to}
                onChange={(e) => handleChange('effective_to', e.target.value)}
                min={formData.effective_from}
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status" className="text-gray-700 dark:text-gray-300">
                Estado
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleChange('status', value)}
              >
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {statuses.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-gray-700 dark:text-gray-300">
              Notas
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Notas adicionales sobre la asignación"
              rows={3}
              className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
            >
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || !formData.employment_id || !formData.package_id || !formData.effective_from}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {assignment ? 'Actualizar' : 'Asignar Paquete'}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
