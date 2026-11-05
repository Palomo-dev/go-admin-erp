'use client';

/**
 * Conexión de logística (transportadoras, Effi, Dropi): `?proveedor=<code>` para iniciar una
 * conexión y `?conexion=<id>` para sus credenciales y la prueba. Punto de entrada único desde
 * Integraciones → Conexiones y desde Transporte → Transportadoras.
 */
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ConexionLogistica, IniciarConexionLogistica } from '@/components/integraciones/conexiones/logistica/ConexionLogistica';
import { Skeleton } from '@/components/ui/skeleton';

function Contenido() {
  const params = useSearchParams();
  const conexion = params?.get('conexion');
  const proveedor = params?.get('proveedor');
  if (conexion) return <ConexionLogistica connectionId={conexion} />;
  return <IniciarConexionLogistica proveedor={proveedor ?? ''} />;
}

export default function ConexionLogisticaPage() {
  return (
    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-3xl" />}>
        <Contenido />
      </Suspense>
    </div>
  );
}
