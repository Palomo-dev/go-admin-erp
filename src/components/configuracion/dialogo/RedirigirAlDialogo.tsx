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

interface Props {
  /**
   * Pantalla sobre la que se abre el diálogo si se entró directo por el enlace
   * (sin pantalla previa en esta pestaña). Por defecto, Inicio; una página que
   * se mudó de su módulo abre sobre el módulo (`/app/crm/salud`).
   */
  base?: string;
}

export function RedirigirAlDialogo({ base = RUTA_BASE_POR_DEFECTO }: Props = {}) {
  const router = useRouter();
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const destino = destinoDesdeRutaVieja(pathname, search, hash) ?? { seccionId: null };
    router.replace(hrefConDialogo(pantallaAnterior() ?? base, destino), { scroll: false });
  }, [router, base]);

  return (
    <div className="space-y-4 p-4 lg:p-8" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
