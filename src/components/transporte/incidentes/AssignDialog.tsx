'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';

interface AssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incidentTitle: string;
  currentAssignee?: number;
  employees: Array<{ id: number; full_name: string; email?: string }>;
  onAssign: (employeeId: number) => Promise<void>;
  isLoading?: boolean;
}

export function AssignDialog({
  open,
  onOpenChange,
  incidentTitle,
  currentAssignee,
  employees,
  onAssign,
  isLoading = false,
}: AssignDialogProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<string>(
    currentAssignee?.toString() || ''
  );

  const handleSubmit = async () => {
    if (!selectedEmployee) return;
    await onAssign(parseInt(selectedEmployee));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Asignar Responsable
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Asignar responsable para: <strong>{incidentTitle}</strong>
          </p>

          <div className="space-y-2">
            <Label>Seleccionar empleado</Label>
            <Select
              value={selectedEmployee}
              onValueChange={setSelectedEmployee}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar responsable..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id.toString()}>
                    <div className="flex flex-col">
                      <span>{emp.full_name}</span>
                      {emp.email && (
                        <span className="text-xs text-gray-500">{emp.email}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !selectedEmployee}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Asignando...
              </>
            ) : (
              'Asignar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignDialog;
