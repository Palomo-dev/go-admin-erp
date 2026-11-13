'use client';

/**
 * Las rutas viejas de Configuración (`/app/configuracion?modulo=&seccion=#ancla`,
 * `/app/configuracion/asistente`, `/app/configuracion/pos/avisos-cliente` y las
 * redirecciones de `next.config.js`) ya no son páginas: abren el diálogo en su
 * sección, sobre la última pantalla que se vio en esta pestaña o, si se entró
 * directo por el enlace, sobre Inicio. `replace`: «Atrás» no vuelve aquí.
 *
 * Los clics en enlaces a estas rutas ni siquiera llegan: el diálogo los
 * intercepta (`ConfiguracionDialogoRaiz`). Esto atiende la carga directa, los
 * `router.push` y las pestañas nuevas.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { destinoDesdeRutaVieja, hrefConDialogo, RUTA_BASE_POR_DEFECTO } from '../config/dialogoUrl';
import { pantallaAnterior } from './abrirConfiguracion';

export function RedirigirAlDialogo() {
  const router = useRouter();
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const destino = destinoDesdeRutaVieja(pathname, search, hash) ?? { seccionId: null };
    router.replace(hrefConDialogo(pantallaAnterior() ?? RUTA_BASE_POR_DEFECTO, destino), { scroll: false });
  }, [router]);

  return (
    <div className="space-y-4 p-4 lg:p-8" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
