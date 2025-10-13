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
      className="h-8 px-2 text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3 text-gray-600 dark:text-gray-400" />
      {ordenarPor.campo === campo && (
        <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">
          {ordenarPor.direccion === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </Button>
  );

  if (tareas.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-0">
          <div className="p-6 sm:p-8 text-center">
            <Info size={32} className="mx-auto mb-2 text-gray-400 dark:text-gray-500" />
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">No hay tareas que coincidan con los filtros aplicados</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-0">
        <div className="overflow-hidden rounded-lg">
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
              
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="p-2 sm:p-3 md:p-4 text-left font-semibold text-gray-900 dark:text-gray-100">
                    <SortButton campo="title">Título</SortButton>
                  </th>
                  <th className="p-2 sm:p-3 md:p-4 text-center font-semibold text-gray-900 dark:text-gray-100">
                    <SortButton campo="type">Tipo</SortButton>
                  </th>
                  <th className="p-2 sm:p-3 md:p-4 text-center font-semibold text-gray-900 dark:text-gray-100">
                    <SortButton campo="priority">Prioridad</SortButton>
                  </th>
                  <th className="p-2 sm:p-3 md:p-4 text-center font-semibold text-gray-900 dark:text-gray-100">
                    <SortButton campo="status">Estado</SortButton>
                  </th>
                  <th className="p-2 sm:p-3 md:p-4 text-center font-semibold text-gray-900 dark:text-gray-100">
                    <SortButton campo="due_date">Fecha límite</SortButton>
                  </th>
                  <th className="p-2 sm:p-3 md:p-4 text-center font-semibold text-gray-900 dark:text-gray-100">
                    <SortButton campo="assigned_to">Asignado</SortButton>
                  </th>
                  <th className="p-2 sm:p-3 md:p-4 text-center font-semibold text-gray-900 dark:text-gray-100">Acciones</th>
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
