'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PageHeader } from './PageHeader';
import { FacturasCompraTable, FiltrosFacturasCompra } from './FacturasCompraTable';
import { FacturasCompraFiltros } from './FacturasCompraFiltros';
import { FacturasProximasVencer } from './FacturasProximasVencer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function FacturasCompraPage() {
  const pathname = usePathname();
  const isInventario = pathname.includes('/inventario/');
  const backPath = isInventario ? '/app/inventario' : '/app/finanzas';

  const [filtrosActuales, setFiltrosActuales] = useState<FiltrosFacturasCompra>({
    busqueda: '',
    estado: 'todos',
    proveedor: 'todos',
    fechaDesde: '',
    fechaHasta: ''
  });

  // Callback memoizado para mejor rendimiento
  const manejarCambioFiltros = useCallback((filtros: FiltrosFacturasCompra) => {
    setFiltrosActuales(filtros);
  }, []);

  // Memoizar filtros para evitar re-renders innecesarios
  const filtrosMemo = useMemo(() => filtrosActuales, [
    filtrosActuales.busqueda,
    filtrosActuales.estado,
    filtrosActuales.proveedor,
    filtrosActuales.fechaDesde,
    filtrosActuales.fechaHasta
  ]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <PageHeader />
      
      {/* Stats Cards */}
      <FacturasProximasVencer diasLimite={15} />

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <FacturasCompraFiltros onFiltrosChange={manejarCambioFiltros} />
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <FacturasCompraTable filtros={filtrosMemo} />
        </CardContent>
      </Card>

      {/* Navegación Rápida */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <Link href={backPath}>
              <Button variant="outline" size="sm">
                ← Volver a {isInventario ? 'Inventario' : 'Finanzas'}
              </Button>
            </Link>
            {isInventario ? (
              <>
                <Link href="/app/inventario/productos">
                  <Button variant="outline" size="sm">Productos</Button>
                </Link>
                <Link href="/app/inventario/categorias">
                  <Button variant="outline" size="sm">Categorías</Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/app/finanzas/cuentas-por-pagar">
                  <Button variant="outline" size="sm">Cuentas por Pagar</Button>
                </Link>
                <Link href="/app/finanzas/proveedores">
                  <Button variant="outline" size="sm">Proveedores</Button>
                </Link>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
