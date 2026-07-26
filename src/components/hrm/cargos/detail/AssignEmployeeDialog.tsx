'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, UserPlus, Loader2, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import JobPositionsService from '@/lib/services/jobPositionsService';

interface UnassignedEmployee {
  employment_id: string;
  member_id: number;
  full_name: string;
  email: string;
  employee_code: string | null;
  current_position: string | null;
}

interface AssignEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positionId: string;
  positionName: string;
  organizationId: number;
  onAssigned: () => void;
}

export function AssignEmployeeDialog({
  open,
  onOpenChange,
  positionId,
  positionName,
  organizationId,
  onAssigned,
}: AssignEmployeeDialogProps) {
  const [employees, setEmployees] = useState<UnassignedEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (open && organizationId) {
      loadUnassignedEmployees();
    }
  }, [open, organizationId]);

  const loadUnassignedEmployees = async () => {
    try {
      setLoading(true);
      const service = new JobPositionsService(organizationId);
      const data = await service.getUnassignedEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Error loading unassigned employees:', error);
      toast.error('Error al cargar empleados disponibles');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (employmentId: string) => {
    try {
      setAssigning(employmentId);
      const service = new JobPositionsService(organizationId);
      await service.assignEmployee(employmentId, positionId);
      toast.success('Empleado asignado correctamente');
      setEmployees(prev => prev.filter(e => e.employment_id !== employmentId));
      onAssigned();
    } catch (error: any) {
      console.error('Error assigning employee:', error);
      toast.error(error.message || 'Error al asignar empleado');
    } finally {
      setAssigning(null);
    }
  };

  const filteredEmployees = employees.filter(e =>
    e.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.employee_code || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Asignar Empleado a {positionName}
          </DialogTitle>
          <DialogDescription>
            Selecciona un empleado sin cargo para asignarlo a esta posición
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar empleado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-gray-500">Cargando empleados...</span>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">
                {employees.length === 0
                  ? 'No hay empleados sin cargo asignado'
                  : 'No se encontraron empleados con el término de búsqueda'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] rounded-md border border-gray-200 dark:border-gray-700">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredEmployees.map((employee) => (
                  <div
                    key={employee.employment_id}
                    className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          {employee.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {employee.full_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {employee.email}
                          {employee.employee_code && ` · ${employee.employee_code}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAssign(employee.employment_id)}
                      disabled={assigning === employee.employment_id}
                      className="flex-shrink-0"
                    >
                      {assigning === employee.employment_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Asignar
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignEmployeeDialog;
