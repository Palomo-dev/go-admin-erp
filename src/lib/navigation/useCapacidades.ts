'use client';

/**
 * Capacidades de la persona en la organización activa, calculadas en el
 * servidor (`GET /api/me/capacidades`). Nunca se deducen del nombre del rol.
 *
 * Mientras cargan por primera vez, o si esa petición falla, todo es `false`:
 * el menú muestra lo mínimo (fail-closed) y se completa cuando llega la
 * respuesta. Una revalidación con datos ya en pantalla no los vacía.
 */
import { useCallback, useEffect, useState } from 'react';
import { CAPACIDADES_NAV, type CapacidadNav } from './catalog';

export interface Capacidades {
  organizationId: number | null;
  esAdmin: boolean;
  capacidades: Record<
    | CapacidadNav
    | 'crearSucursal'
    | 'gestionarOrganizacion'
    | 'gestionarMiembros'
    | 'gestionarFacturacion',
    boolean
  >;
  /** `accesoTotal`: tiene todas las sucursales activas (puede ver el consolidado). */
  sucursales: { permitidas: number[]; verTodas: boolean; accesoTotal: boolean };
}

const VACIAS: Capacidades = {
  organizationId: null,
  esAdmin: false,
  capacidades: {
    gestionarNotificaciones: false,
    verAnaliticaWeb: false,
    variasSedes: false,
    crearSucursal: false,
    gestionarOrganizacion: false,
    gestionarMiembros: false,
    gestionarFacturacion: false,
  },
  sucursales: { permitidas: [], verTodas: false, accesoTotal: false },
};

// Una sola petición en vuelo para todos los componentes que la piden a la vez.
let enVuelo: Promise<Capacidades> | null = null;
let ultima: Capacidades | null = null;

/** Solo pruebas: la caché vive en el módulo y si no se olvida, el caso siguiente hereda el anterior. */
export function olvidarCapacidades(): void {
  ultima = null;
  enVuelo = null;
}

async function pedir(): Promise<Capacidades> {
  if (!enVuelo) {
    enVuelo = fetch('/api/me/capacidades', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`capacidades ${r.status}`);
        const datos = (await r.json()) as Capacidades;
        ultima = datos;
        return datos;
      })
      .finally(() => {
        enVuelo = null;
      });
  }
  return enVuelo;
}

export function useCapacidades(): {
  datos: Capacidades;
  cargando: boolean;
  /** La petición falló: `datos` son los vacíos (todo `false`), no un «no» del servidor. */
  error: boolean;
  recargar: () => void;
  navegacion: ReadonlySet<CapacidadNav>;
} {
  const [datos, setDatos] = useState<Capacidades>(ultima ?? VACIAS);
  const [cargando, setCargando] = useState(ultima === null);
  const [error, setError] = useState(false);

  const recargar = useCallback(() => {
    // Con datos en pantalla, revalidar no pone el esqueleto: activar un módulo
    // (y el efecto de montaje de una pantalla que ya tiene la caché) no debe
    // vaciar la organización. La primera lectura, sí.
    const enFrio = ultima === null;
    if (enFrio) setCargando(true);
    pedir()
      .then((d) => {
        setDatos(d);
        setError(false);
      })
      .catch((e) => {
        console.warn('[useCapacidades] no se pudieron cargar; se muestra el menú mínimo', e);
        if (enFrio) {
          setDatos(VACIAS);
          setError(true);
        }
      })
      .finally(() => {
        if (enFrio) setCargando(false);
      });
  }, []);

  useEffect(() => {
    recargar();
    // Cambiar de organización invalida permisos y sucursales. Activar un
    // módulo no: estas capacidades no salen de `organization_modules`.
    // Escuchar `modules-updated` aquí ponía `cargando` y la pantalla de
    // módulos desmontaba la lista (esqueleto), como si la página recargara.
    const alCambiarOrg = () => {
      ultima = null;
      setDatos(VACIAS);
      setError(false);
      recargar();
    };
    window.addEventListener('organization-changed', alCambiarOrg);
    return () => {
      window.removeEventListener('organization-changed', alCambiarOrg);
    };
  }, [recargar]);

  // Las capacidades del menú (`PaginaNav.requiere`): las que el servidor marcó.
  // Un servidor viejo que no las mande cuenta como «no» (fail-closed).
  const navegacion = new Set<CapacidadNav>(CAPACIDADES_NAV.filter((c) => datos.capacidades[c] === true));
  return { datos, cargando, error, recargar, navegacion };
}
