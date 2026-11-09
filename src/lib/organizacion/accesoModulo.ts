/**
 * Acceso a un módulo o página que la persona no puede usar — la regla ÚNICA,
 * compartida por el middleware (Edge) y el resolutor del servidor
 * (`accesoModulo.server.ts`). Diseño: docs/design/MODULO-NO-HABILITADO.md
 * (Figma `EAvjINVRnlzFM70GVoWXgl`, sección `2416:62653`).
 *
 * Orden de las causas (el mismo en los dos lados):
 *  1. Módulo sin fila activa en `organization_modules` y que no es básico
 *     (`modules.is_core`) → `modulo`. El resolutor lo afina con
 *     `estadoModulo()`: `apagado` (cabe en el plan), `limite` (no cabe) u
 *     `otroPlan` (la organización no tiene plan).
 *  2. El cargo tiene filas en `job_position_module_access` y ninguna del
 *     módulo con `can_access` → `cargo` (`cargoPuedeEntrarAModulo`).
 *  3. La página que contiene la ruta está oculta en la organización
 *     (`organization_module_pages.is_active = false`) → `pagina`
 *     (`paginaActiva()`, la misma regla que el menú).
 *
 * La suscripción vencida (causa E) NO pasa por aquí: va antes y sigue
 * redirigiendo a `/app/cuenta-congelada`.
 *
 * Fail open: cualquier dato que no se pudo leer cuenta como «sin bloqueo». La
 * UI y las APIs vuelven a validar; el menú no es la barrera.
 *
 * Funciones puras, sin Supabase: se importan desde el Edge y desde Node.
 */
import { cargoPuedeEntrarAModulo, type FilaAccesoModulo } from '@/lib/navigation/accesoCargo';
import { paginaActiva } from '@/lib/navigation/paginaActiva';
import type { EstadoModulo } from './modulos';

/**
 * Ruta interna a la que el middleware REESCRIBE (no redirige) la petición
 * bloqueada: la URL del navegador no cambia.
 */
export const RUTA_MODULO_NO_HABILITADO = '/app/modulo-no-habilitado';

/** Lo que el middleware sabe distinguir con sus consultas. */
export type BloqueoGate = 'modulo' | 'cargo' | 'pagina';

/** Causa que ve la persona (matriz causa × rol del diseño). */
export type CausaAcceso = 'apagado' | 'limite' | 'otroPlan' | 'paginaOculta' | 'cargo';

export interface DatosGate {
  codigo: string;
  /**
   * Filas activas del módulo en `organization_modules`. `null` = la consulta
   * falló (fail open).
   */
  filasActivas: number | null;
  /**
   * `modules.is_core` del módulo. `null` = la consulta falló o el módulo no
   * existe en `modules`: no se bloquea por algo que no se sabe.
   */
  esNucleo: boolean | null;
  /**
   * Filas de `job_position_module_access` del cargo. `null` = sin restricción
   * por cargo (sin miembro, super admin, sin cargo) o consulta fallida.
   */
  filasCargo: readonly Pick<FilaAccesoModulo, 'module_code' | 'can_access'>[] | null;
  /** Página del catálogo que contiene la ruta (`paginaDeRuta`), o `null`. */
  pagina: string | null;
  /**
   * Páginas ocultas del módulo (`organization_module_pages.is_active = false`).
   * `null` = la consulta falló (fail open: nada oculto).
   */
  paginasOcultas: readonly string[] | null;
}

/** ¿Hay que bloquear? `null` = dejar pasar. Mismo orden que el resolutor. */
export function bloqueoGate(d: DatosGate): BloqueoGate | null {
  if (d.filasActivas === null) return null; // consulta fallida → permitir
  const moduloActivo = d.filasActivas > 0 || d.esNucleo === true;
  if (!moduloActivo) return d.esNucleo === false ? 'modulo' : null;
  if (d.filasCargo !== null && !cargoPuedeEntrarAModulo(d.filasCargo, d.codigo)) return 'cargo';
  if (d.pagina && d.paginasOcultas && d.paginasOcultas.length > 0) {
    const visible = paginaActiva(d.codigo, d.pagina, {
      modulosActivos: [d.codigo],
      paginasOcultas: { [d.codigo]: [...d.paginasOcultas] },
    });
    if (!visible) return 'pagina';
  }
  return null;
}

/** URL interna de la reescritura. `ruta` es la que pidió el navegador. */
export function urlReescritura(base: string | URL, ruta: string, bloqueo: BloqueoGate, codigo: string): URL {
  const url = new URL(RUTA_MODULO_NO_HABILITADO, base);
  url.searchParams.set('ruta', ruta);
  url.searchParams.set('bloqueo', bloqueo);
  url.searchParams.set('modulo', codigo);
  return url;
}

/** Causa visible de un módulo apagado, a partir de `estadoModulo()`. `null` si está activo o es básico. */
export function causaDeEstado(estado: EstadoModulo): Extract<CausaAcceso, 'apagado' | 'limite' | 'otroPlan'> | null {
  switch (estado.tipo) {
    case 'disponible':
      return 'apagado';
    case 'limite':
      return 'limite';
    case 'otroPlan':
      return 'otroPlan';
    default:
      return null;
  }
}

/** Tipo de notificación interna de cada causa (`notifications.payload.type`). */
export const TIPO_AVISO: Record<CausaAcceso, string> = {
  apagado: 'modulo_pide_encender',
  limite: 'modulo_pide_encender',
  otroPlan: 'modulo_pide_encender',
  paginaOculta: 'modulo_pide_mostrar_pagina',
  cargo: 'modulo_pide_acceso_cargo',
};

/**
 * Acción principal de cada pantalla según la matriz causa × rol. `puedeResolver`
 * lo decide SIEMPRE el servidor (misma regla que `POST /api/modules` para
 * módulos y páginas; `hr.positions.edit` para cargos).
 */
export type AccionPrincipal = 'encender' | 'verPlanes' | 'mostrarPagina' | 'irAModulo' | 'editarCargo' | 'avisar' | 'pedirAcceso';

export function accionPrincipal(causa: CausaAcceso, puedeResolver: boolean): AccionPrincipal {
  switch (causa) {
    case 'apagado':
      return puedeResolver ? 'encender' : 'avisar';
    case 'limite':
    case 'otroPlan':
      return puedeResolver ? 'verPlanes' : 'avisar';
    case 'paginaOculta':
      return puedeResolver ? 'mostrarPagina' : 'irAModulo';
    case 'cargo':
      return puedeResolver ? 'editarCargo' : 'pedirAcceso';
  }
}

/** ¿Esta persona, en esta causa, puede mandar el aviso? (quien resuelve no se avisa a sí mismo). */
export function puedeAvisar(causa: CausaAcceso, puedeResolver: boolean): boolean {
  return !puedeResolver && TIPO_AVISO[causa] !== undefined;
}

// ─── Contrato de `GET /api/modules/acceso` y `GET /api/modules/no-usados` ───
// Vive aquí (puro) para que la pantalla del navegador lo importe sin tocar el
// archivo de servidor.

/** Papel de quien resuelve, para pintarlo traducido (nunca el nombre del rol). */
export type PapelPersona = 'dueno' | 'administrador' | 'gestionaCargos';

export interface PersonaResuelve {
  nombre: string;
  papel: PapelPersona;
}

export interface PlanResumen {
  codigo: string;
  nombre: string;
  /** Opcionales que permite (`null` = sin límite). */
  cupo: number | null;
}

export interface AccesoModuloResuelto {
  /** `null` = la ruta no está bloqueada (o no se pudo saber: fail open). */
  causa: CausaAcceso | null;
  /** Código del módulo de la ruta. */
  modulo: string | null;
  /** Página del catálogo que contiene la ruta. */
  pagina: string | null;
  puedeResolver: boolean;
  puedeAvisar: boolean;
  /** Ya avisó hoy (el botón dice «Ya avisaste…»). */
  yaAvisado: boolean;
  organizacion: string;
  /** Solo para quien resuelve y causas de módulo apagado. */
  plan: { nombre: string | null; cupo: number | null; usados: number } | null;
  /** Solo para quien resuelve y causa `limite`/`otroPlan`: planes donde cabe. */
  planesConCupo: PlanResumen[];
  /** Solo para quien resuelve y causa `limite`: opcionales encendidos (códigos). */
  opcionalesEncendidos: string[];
  /**
   * `apagado`/`limite`/`otroPlan`: páginas del módulo (hrefs del catálogo).
   * `paginaOculta`: las que sí se ven. `cargo`: vacío.
   */
  paginas: string[];
  /** Quién puede resolverlo (nombre y papel, sin contacto). */
  personas: PersonaResuelve[];
  /** Nombre de quien pregunta: el ejemplo «{persona} pide encender…» de la pantalla. */
  persona: string | null;
  /** Causa `cargo`: el cargo y los módulos activos que sí deja usar. */
  cargo: { id: string; nombre: string | null; modulos: string[] } | null;
}

export interface ModuloNoUsado {
  codigo: string;
  /** `apagado`: se puede encender; `limite` u `otroPlan`: no cabe en el plan. */
  estado: 'apagado' | 'limite' | 'otroPlan';
  /** Ruta del módulo (abre la pantalla 01 o 03). */
  href: string;
  /** Hrefs de sus páginas, para buscar por nombre de página. */
  paginas: string[];
}
