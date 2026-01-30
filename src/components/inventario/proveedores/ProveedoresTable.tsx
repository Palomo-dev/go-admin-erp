"use client";

import React, { useState } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  Eye, 
  Pencil, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Copy
} from 'lucide-react';
import { Proveedor } from './types';
import { cn } from '@/utils/Utils';
import Link from 'next/link';

interface ProveedoresTableProps {
  proveedores: Proveedor[];
  onDelete: (uuid: string) => void;
  onDuplicate?: (uuid: string) => void;
}

/**
 * Tabla de proveedores con opciones de visualizar, editar y eliminar
 */
const ProveedoresTable: React.FC<ProveedoresTableProps> = ({
  proveedores,
  onDelete,
  onDuplicate
}) => {
  const { theme } = useTheme();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  
  const totalPages = Math.ceil(proveedores.length / itemsPerPage);
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedProveedores = proveedores.slice(start, end);
  
  // Función para mostrar un indicador de cumplimiento con color según el porcentaje
  const getCumplimientoIndicator = (cumplimiento: number | undefined) => {
    if (cumplimiento === undefined) return null;
    
    let color;
    if (cumplimiento >= 80) {
      color = 'bg-green-500 dark:bg-green-600';
    } else if (cumplimiento >= 60) {
      color = 'bg-yellow-500 dark:bg-yellow-600';
    } else {
      color = 'bg-red-500 dark:bg-red-600';
    }
    
    return (
      <div className="flex items-center gap-2">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className={cn("h-2 rounded-full", color)}
            style={{ width: `${cumplimiento}%` }}
          />
        </div>
        <span className="text-xs sm:text-sm">{cumplimiento}%</span>
      </div>
    );
  };
  
  return (
    <div className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50">
              <TableHead className="w-[60px] sm:w-[80px] text-xs sm:text-sm dark:text-gray-300">ID</TableHead>
              <TableHead className="text-xs sm:text-sm dark:text-gray-300">Nombre</TableHead>
              <TableHead className="hidden md:table-cell text-xs sm:text-sm dark:text-gray-300">NIT</TableHead>
              <TableHead className="hidden lg:table-cell text-xs sm:text-sm dark:text-gray-300">Contacto</TableHead>
              <TableHead className="hidden sm:table-cell text-xs sm:text-sm dark:text-gray-300">Teléfono</TableHead>
              <TableHead className="hidden xl:table-cell text-xs sm:text-sm dark:text-gray-300">Correo</TableHead>
              <TableHead className="hidden md:table-cell text-xs sm:text-sm dark:text-gray-300">Días Crédito</TableHead>
              <TableHead className="hidden lg:table-cell text-xs sm:text-sm dark:text-gray-300">Cumplimiento</TableHead>
              <TableHead className="text-right text-xs sm:text-sm dark:text-gray-300">Acciones</TableHead>
            </TableRow>
          </TableHeader>
        <TableBody>
          {paginatedProveedores.length === 0 ? (
            <TableRow>
              <TableCell 
                colSpan={9} 
                className="text-center py-8 sm:py-10 text-sm text-gray-500 dark:text-gray-400"
              >
                No hay proveedores registrados
              </TableCell>
            </TableRow>
          ) : (
            paginatedProveedores.map((proveedor) => (
              <TableRow 
                key={proveedor.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <TableCell className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">{proveedor.id}</TableCell>
                <TableCell className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">{proveedor.name}</TableCell>
                <TableCell className="hidden md:table-cell text-xs sm:text-sm text-gray-700 dark:text-gray-300">{proveedor.nit || '-'}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs sm:text-sm text-gray-700 dark:text-gray-300">{proveedor.contact || '-'}</TableCell>
                <TableCell className="hidden sm:table-cell text-xs sm:text-sm text-gray-700 dark:text-gray-300">{proveedor.phone || '-'}</TableCell>
                <TableCell className="hidden xl:table-cell text-xs sm:text-sm text-gray-700 dark:text-gray-300">{proveedor.email || '-'}</TableCell>
                <TableCell className="hidden md:table-cell text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                  {proveedor.condiciones_pago?.dias_credito || '-'}
                </TableCell>
                <TableCell className="hidden lg:table-cell w-[180px] sm:w-[200px]">
                  {getCumplimientoIndicator(proveedor.cumplimiento)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1 sm:gap-2">
                    <Link href={`/app/inventario/proveedores/${proveedor.uuid}`}>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 dark:border-gray-600 dark:hover:bg-gray-700"
                        title="Ver detalles"
                      >
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </Link>
                    <Link href={`/app/inventario/proveedores/${proveedor.uuid}/editar`}>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 dark:border-gray-600 dark:hover:bg-gray-700"
                        title="Editar"
                      >
                        <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </Link>
                    {onDuplicate && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onDuplicate(proveedor.uuid)}
                        className="h-7 w-7 sm:h-8 sm:w-8 dark:border-gray-600 dark:hover:bg-gray-700"
                        title="Duplicar"
                      >
                        <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onDelete(proveedor.uuid)}
                      className="h-7 w-7 sm:h-8 sm:w-8 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-500 dark:border-gray-600 dark:hover:bg-gray-700"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
      
      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Mostrando {start + 1}-{Math.min(end, proveedores.length)} de {proveedores.length}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="text-xs sm:text-sm dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline ml-1">Anterior</span>
            </Button>
            <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="text-xs sm:text-sm dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <span className="hidden sm:inline mr-1">Siguiente</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProveedoresTable;
