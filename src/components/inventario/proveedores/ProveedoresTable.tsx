"use client";

import React, { useState } from 'react';
import { useTheme } from 'next-themes';
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
  ChevronRight 
} from 'lucide-react';
import { Proveedor } from './types';
import { cn } from '@/utils/Utils';

interface ProveedoresTableProps {
  proveedores: Proveedor[];
  onView: (proveedor: Proveedor) => void;
  onEdit: (proveedor: Proveedor) => void;
  onDelete: (id: number) => void;
}

/**
 * Tabla de proveedores con opciones de visualizar, editar y eliminar
 */
const ProveedoresTable: React.FC<ProveedoresTableProps> = ({
  proveedores,
  onView,
  onEdit,
  onDelete
}) => {
  const { theme } = useTheme();
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
      color = theme === 'dark' ? 'bg-green-600' : 'bg-green-500';
    } else if (cumplimiento >= 60) {
      color = theme === 'dark' ? 'bg-yellow-600' : 'bg-yellow-500';
    } else {
      color = theme === 'dark' ? 'bg-red-600' : 'bg-red-500';
    }
    
    return (
      <div className="flex items-center gap-2">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className={cn("h-2 rounded-full", color)}
            style={{ width: `${cumplimiento}%` }}
          />
        </div>
        <span>{cumplimiento}%</span>
      </div>
    );
  };
  
  return (
    <div className={`w-full rounded-md border ${
      theme === 'dark' ? 'border-gray-800 bg-gray-950/50' : 'border-gray-200 bg-white'
    }`}>
      <Table>
        <TableHeader>
          <TableRow className={theme === 'dark' ? 'hover:bg-gray-800/50' : 'hover:bg-gray-100'}>
            <TableHead className="w-[100px]">ID</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>NIT</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Días Crédito</TableHead>
            <TableHead>Cumplimiento</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedProveedores.length === 0 ? (
            <TableRow>
              <TableCell 
                colSpan={9} 
                className={`text-center py-10 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
                No hay proveedores registrados
              </TableCell>
            </TableRow>
          ) : (
            paginatedProveedores.map((proveedor) => (
              <TableRow 
                key={proveedor.id}
                className={theme === 'dark' ? 'hover:bg-gray-800/50' : 'hover:bg-gray-100'}
              >
                <TableCell className="font-medium">{proveedor.id}</TableCell>
                <TableCell className="font-medium">{proveedor.name}</TableCell>
                <TableCell>{proveedor.nit || '-'}</TableCell>
                <TableCell>{proveedor.contact || '-'}</TableCell>
                <TableCell>{proveedor.phone || '-'}</TableCell>
                <TableCell>{proveedor.email || '-'}</TableCell>
                <TableCell>
                  {proveedor.condiciones_pago?.dias_credito || '-'}
                </TableCell>
                <TableCell className="w-[200px]">
                  {getCumplimientoIndicator(proveedor.cumplimiento)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onView(proveedor)}
                      className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onEdit(proveedor)}
                      className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onDelete(proveedor.id)}
                      className={theme === 'dark' 
                        ? 'text-red-500 hover:text-red-600 hover:bg-gray-800' 
                        : 'text-red-500 hover:text-red-600 hover:bg-gray-100'
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      
      {/* Paginación */}
      {totalPages > 1 && (
        <div className={`flex items-center justify-between p-4 ${
          theme === 'dark' ? 'border-t border-gray-800' : 'border-t border-gray-200'
        }`}>
          <div className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
            Mostrando {start + 1}-{Math.min(end, proveedores.length)} de {proveedores.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className={theme === 'dark' 
                ? 'border-gray-800 hover:bg-gray-800' 
                : 'border-gray-200 hover:bg-gray-100'
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className={theme === 'dark' 
                ? 'border-gray-800 hover:bg-gray-800' 
                : 'border-gray-200 hover:bg-gray-100'
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProveedoresTable;
