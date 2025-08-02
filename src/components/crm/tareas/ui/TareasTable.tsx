'use client';

import React from 'react';
import { Task } from '@/types/task';
import { Card, CardContent } from "@/components/ui/card";
import { Info, ArrowUpDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import TareasTableRow from './TareasTableRow';

interface TareasTableProps {
  tareas: Task[];
  onEditTask?: (tarea: Task) => void;
  onViewDetails: (tarea: Task) => void;
  onCancelTask: (tarea: Task) => void;
  onSort: (campo: keyof Task) => void;
  ordenarPor: {campo: keyof Task, direccion: 'asc' | 'desc'};
}

const TareasTable: React.FC<TareasTableProps> = ({
  tareas,
  onEditTask,
  onViewDetails,
  onCancelTask,
  onSort,
  ordenarPor
}) => {
  const SortButton = ({ campo, children }: { campo: keyof Task; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSort(campo)}
      className="h-8 px-2 text-xs font-medium"
    >
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3" />
      {ordenarPor.campo === campo && (
        <span className="ml-1 text-xs">
          {ordenarPor.direccion === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </Button>
  );

  if (tareas.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="p-8 text-center">
            <Info size={32} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">No hay tareas que coincidan con los filtros aplicados</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: '24%' }} className="min-w-[180px]" />
                <col style={{ width: '10%' }} className="min-w-[100px]" />
                <col style={{ width: '10%' }} className="min-w-[100px]" />
                <col style={{ width: '12%' }} className="min-w-[100px]" />
                <col style={{ width: '10%' }} className="min-w-[100px]" />
                <col style={{ width: '14%' }} className="min-w-[120px]" />
                <col style={{ width: '10%' }} className="min-w-[80px]" />
              </colgroup>
              
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-4 text-left font-medium">
                    <SortButton campo="title">Título</SortButton>
                  </th>
                  <th className="p-4 text-center font-medium">
                    <SortButton campo="type">Tipo</SortButton>
                  </th>
                  <th className="p-4 text-center font-medium">
                    <SortButton campo="priority">Prioridad</SortButton>
                  </th>
                  <th className="p-4 text-center font-medium">
                    <SortButton campo="status">Estado</SortButton>
                  </th>
                  <th className="p-4 text-center font-medium">
                    <SortButton campo="due_date">Fecha límite</SortButton>
                  </th>
                  <th className="p-4 text-center font-medium">
                    <SortButton campo="assigned_to">Asignado</SortButton>
                  </th>
                  <th className="p-4 text-center font-medium">Acciones</th>
                </tr>
              </thead>
              
              <tbody>
                {tareas.map((tarea) => (
                  <TareasTableRow
                    key={tarea.id}
                    tarea={tarea}
                    onEditTask={onEditTask}
                    onViewDetails={onViewDetails}
                    onCancelTask={onCancelTask}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TareasTable;
