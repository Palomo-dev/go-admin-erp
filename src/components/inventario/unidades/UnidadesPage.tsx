'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { Ruler, Search, RefreshCw, Info, ArrowLeft } from 'lucide-react';
import { UnidadesService } from './UnidadesService';
import { Unit } from './types';
import { useToast } from '@/components/ui/use-toast';

/**
 * Listado de unidades de medida. Solo lectura: `units` es global y la
 * escribe service_role (ver UnidadesService). Las conversiones propias de la
 * organización se gestionan en ConversionesPage.
 */
export function UnidadesPage() {
  const { toast } = useToast();
  const [unidades, setUnidades] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const cargarUnidades = useCallback(async () => {
    try {
      setLoading(true);
      const data = await UnidadesService.obtenerUnidades();
      setUnidades(data);
    } catch (error) {
      console.error('Error cargando unidades:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las unidades',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    cargarUnidades();
  }, [cargarUnidades]);

  const unidadesFiltradas = unidades.filter(u =>
    u.name.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.code.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalPages = Math.ceil(unidadesFiltradas.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const unidadesPaginadas = useMemo(
    () => unidadesFiltradas.slice(startIndex, startIndex + pageSize),
    [unidadesFiltradas, startIndex, pageSize]
  );

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario">
            <Button variant="ghost" size="icon" aria-label="Volver a inventario">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Ruler className="h-6 w-6 text-blue-600" />
              </div>
              Unidades de Medida
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Unidades
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={cargarUnidades}
            disabled={loading}
            aria-label="Recargar unidades"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Contenido */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4 space-y-3">
          <p className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            Las unidades son comunes a todas las empresas y las administra GO Admin.
            Las conversiones propias de tu empresa se crean en Conversiones.
          </p>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por código o nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg animate-pulse">
                  <div className="w-16 h-8 bg-gray-200 dark:bg-gray-600 rounded"></div>
                  <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded w-40"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20"></div>
                </div>
              ))}
            </div>
          ) : unidadesFiltradas.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <Ruler className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No hay unidades de medida</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Código</TableHead>
                  <TableHead className="dark:text-gray-300">Nombre</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Factor</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Productos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unidadesPaginadas.map(unidad => (
                  <TableRow key={unidad.code} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 font-mono text-sm font-medium">
                        {unidad.code}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium dark:text-white">
                      {unidad.name}
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      <span className="font-mono">{unidad.conversion_factor}</span>
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      {unidad.product_count || 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={unidadesFiltradas.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
