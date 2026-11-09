/**
 * Rutas y páginas de cada módulo, SIN iconos ni React: lo que el middleware
 * (Edge) necesita para saber a qué módulo y a qué página pertenece una URL.
 *
 * Por qué no se importa `catalog.ts` desde el middleware: el catálogo arrastra
 * ~110 iconos de `lucide-react` (y con ellos React) y `config/crmNav.ts`. Meter
 * eso en el bundle del Edge es peso y riesgo (condiciones de exportación de
 * React en el runtime del middleware) en el camino de CADA petición.
 *
 * Por qué no es una segunda lista: `__tests__/rutasModulos.test.ts` deriva este
 * mismo arreglo de `CATALOGO_NAV` y falla si no coinciden, imprimiendo el
 * bloque exacto que hay que pegar aquí. Una página nueva del catálogo obliga a
 * actualizar este archivo en el mismo cambio. Antes el middleware tenía su
 * propio `routeToModuleMap` cableado, que ya no coincidía con el catálogo
 * (`/app/pm`, `/app/admin` y `/app/configuracion` no estaban).
 *
 * Funciones puras: se importan desde el Edge, desde Node y desde el navegador.
 */

export interface RutasModulo {
  /** `modules.code`. */
  codigo: string;
  /** Prefijos de ruta del módulo (`ModuloNav.rutas`). */
  rutas: readonly string[];
  /** `href` de cada página del módulo, en el orden del catálogo (`ModuloNav.paginas`). */
  paginas: readonly string[];
}

export const RUTAS_MODULOS: readonly RutasModulo[] = [
  {
    codigo: 'pos',
    rutas: ['/app/pos'],
    paginas: [
      '/app/pos',
      '/app/pos/pedidos-online',
      '/app/pos/ventas',
      '/app/pos/cajas',
      '/app/pos/devoluciones',
      '/app/pos/cuentas-por-cobrar',
      '/app/pos/mesas',
      '/app/pos/reservas-mesas',
      '/app/pos/comandas',
      '/app/pos/propinas',
      '/app/pos/cargos-servicio',
      '/app/pos/cupones',
      '/app/pos/promociones',
    ],
  },
  {
    codigo: 'clientes',
    rutas: ['/app/clientes'],
    paginas: [
      '/app/clientes',
    ],
  },
  {
    codigo: 'crm',
    rutas: ['/app/crm'],
    paginas: [
      '/app/crm/clientes',
      '/app/crm/identidades',
      '/app/crm/segmentos',
      '/app/crm/salud',
      '/app/crm/leads',
      '/app/crm/pipeline',
      '/app/crm/oportunidades',
      '/app/crm/pronostico',
      '/app/crm/equipo',
      '/app/crm/objeciones',
      '/app/crm/actividades',
      '/app/crm/llamadas',
      '/app/crm/campanas',
      '/app/crm/plantillas',
      '/app/crm/secuencias',
      '/app/crm/referidos',
      '/app/crm/partners',
      '/app/crm/agentes-ia',
      '/app/crm/automatizaciones',
    ],
  },
  {
    codigo: 'website',
    rutas: ['/app/sitio-web'],
    paginas: [
      '/app/sitio-web',
      '/app/sitio-web/paginas',
      '/app/sitio-web/diseno',
      '/app/sitio-web/plantillas',
      '/app/sitio-web/carta',
      '/app/sitio-web/tienda',
      '/app/sitio-web/ventas',
      '/app/sitio-web/dominios',
      '/app/sitio-web/seo',
      '/app/sitio-web/analitica',
      '/app/sitio-web/sedes',
      '/app/sitio-web/configuracion',
    ],
  },
  {
    codigo: 'chat',
    rutas: ['/app/chat'],
    paginas: [
      '/app/chat/bandeja',
      '/app/chat/canales',
      '/app/chat/conocimiento',
      '/app/chat/ia',
      '/app/chat/ia/laboratorio',
      '/app/chat/widget/sesiones',
      '/app/chat/auditoria',
    ],
  },
  {
    codigo: 'pms_hotel',
    rutas: ['/app/pms'],
    paginas: [
      '/app/pms/calendario',
      '/app/pms/reservas',
      '/app/pms/grupos',
      '/app/pms/asignaciones',
      '/app/pms/checkin',
      '/app/pms/checkout',
      '/app/pms/folios',
      '/app/pms/parking',
      '/app/pms/espacios',
      '/app/pms/tipos-espacio',
      '/app/pms/categorias',
      '/app/pms/servicios',
      '/app/pms/tarifas',
      '/app/pms/housekeeping',
      '/app/pms/mantenimiento',
      '/app/pms/origenes',
      '/app/pms/channel-manager',
    ],
  },
  {
    codigo: 'memberships',
    rutas: ['/app/membresias'],
    paginas: [
      '/app/membresias',
      '/app/membresias/miembros',
      '/app/membresias/membresias',
      '/app/membresias/planes',
      '/app/membresias/clases',
      '/app/membresias/reservas',
      '/app/membresias/check-in',
      '/app/membresias/instructores',
      '/app/membresias/control-de-acceso',
      '/app/membresias/pagos',
    ],
  },
  {
    codigo: 'parking',
    rutas: ['/app/parking'],
    paginas: [
      '/app/parking/operacion',
      '/app/parking/sesiones',
      '/app/parking/abonados',
      '/app/parking/planes',
      '/app/parking/pagos',
      '/app/parking/tarifas',
      '/app/parking/espacios',
      '/app/parking/zonas',
      '/app/parking/mapa',
    ],
  },
  {
    codigo: 'transport',
    rutas: ['/app/transporte'],
    paginas: [
      '/app/transporte/viajes',
      '/app/transporte/boletos',
      '/app/transporte/tarifas-pasajeros',
      '/app/transporte/envios',
      '/app/transporte/mis-envios',
      '/app/transporte/tarifas-envio',
      '/app/transporte/tracking',
      '/app/transporte/etiquetas',
      '/app/transporte/manifiestos',
      '/app/transporte/transportadoras',
      '/app/transporte/vehiculos',
      '/app/transporte/conductores',
      '/app/transporte/paradas',
      '/app/transporte/rutas',
      '/app/transporte/horarios',
      '/app/transporte/direcciones-clientes',
      '/app/transporte/incidentes',
    ],
  },
  {
    codigo: 'inventory',
    rutas: ['/app/inventario'],
    paginas: [
      '/app/inventario/productos',
      '/app/inventario/categorias',
      '/app/inventario/etiquetas',
      '/app/inventario/variantes/tipos',
      '/app/inventario/variantes/valores',
      '/app/inventario/unidades',
      '/app/inventario/conversiones',
      '/app/inventario/imagenes',
      '/app/inventario/stock',
      '/app/inventario/movimientos',
      '/app/inventario/ajustes',
      '/app/inventario/transferencias',
      '/app/inventario/consignaciones',
      '/app/inventario/lotes',
      '/app/inventario/seriales',
      '/app/inventario/garantias',
      '/app/inventario/proveedores',
      '/app/inventario/ordenes-compra',
      '/app/inventario/recetas',
      '/app/inventario/produccion',
      '/app/inventario/distribucion',
      '/app/inventario/reportes/trazabilidad',
      '/app/inventario/reportes/costo-recetas',
      '/app/inventario/reportes/stock-sin-seriales',
    ],
  },
  {
    codigo: 'finance',
    rutas: ['/app/finanzas'],
    paginas: [
      '/app/finanzas/facturas-venta',
      '/app/finanzas/cotizaciones',
      '/app/finanzas/facturas-compra',
      '/app/finanzas/notas-credito',
      '/app/finanzas/documentos-soporte',
      '/app/finanzas/facturacion-electronica',
      '/app/finanzas/tesoreria/movimientos',
      '/app/finanzas/ingresos',
      '/app/finanzas/egresos',
      '/app/finanzas/tesoreria/cuentas',
      '/app/finanzas/tesoreria/conciliacion',
      '/app/finanzas/tesoreria/transferencias',
      '/app/finanzas/tesoreria/dinero-de-terceros',
      '/app/finanzas/categorias-tesoreria',
      '/app/finanzas/open-finance',
      '/app/finanzas/payfac/dispersiones',
      '/app/finanzas/cuentas-por-cobrar',
      '/app/finanzas/saldos-a-favor',
      '/app/finanzas/cuentas-por-pagar',
      '/app/finanzas/anticipos-proveedores',
      '/app/finanzas/contabilidad',
      '/app/finanzas/contabilidad/plan-cuentas',
      '/app/finanzas/contabilidad/actualizar-puc',
      '/app/finanzas/contabilidad/asientos',
      '/app/finanzas/contabilidad/mayor-contable',
      '/app/finanzas/contabilidad/salud',
      '/app/finanzas/contabilidad/plantillas',
      '/app/finanzas/contabilidad/periodos-fiscales',
      '/app/finanzas/reglas-contables',
      '/app/finanzas/centro-costos',
      '/app/finanzas/activos-fijos',
      '/app/finanzas/presupuestos',
      '/app/finanzas/tributario',
      '/app/finanzas/tributario/perfil',
      '/app/finanzas/tributario/certificados',
      '/app/finanzas/impuestos',
      '/app/finanzas/metodos-pago',
      '/app/finanzas/monedas',
      '/app/finanzas/comisiones',
      '/app/finanzas/configuracion-contable',
    ],
  },
  {
    codigo: 'hrm',
    rutas: ['/app/hrm'],
    paginas: [
      '/app/hrm/empleados',
      '/app/hrm/departamentos',
      '/app/hrm/cargos',
      '/app/hrm/turnos',
      '/app/hrm/marcacion',
      '/app/hrm/asistencia',
      '/app/hrm/ausencias',
      '/app/hrm/nomina',
      '/app/hrm/compensacion',
      '/app/hrm/prestamos',
      '/app/hrm/reglas-pais',
    ],
  },
  {
    codigo: 'pm',
    rutas: ['/app/pm'],
    paginas: [
      '/app/pm/proyectos',
      '/app/pm/metas',
      '/app/pm/tareas',
    ],
  },
  {
    codigo: 'calendar',
    rutas: ['/app/calendario'],
    paginas: [
      '/app/calendario',
      '/app/calendario/recurrencias',
      '/app/calendario/importar',
    ],
  },
  {
    codigo: 'reports',
    rutas: ['/app/reportes'],
    paginas: [
      '/app/reportes',
    ],
  },
  {
    codigo: 'organizations',
    rutas: ['/app/organizacion', '/app/plan'],
    paginas: [
      '/app/organizacion/miembros',
      '/app/organizacion/invitaciones',
      '/app/organizacion/sucursales',
      '/app/organizacion/plan',
      '/app/plan/historial',
      '/app/organizacion/modulos',
      '/app/organizacion/informacion',
      '/app/organizacion/mis-organizaciones',
    ],
  },
  {
    codigo: 'roles',
    rutas: ['/app/roles', '/app/admin'],
    paginas: [
      '/app/roles',
    ],
  },
  {
    codigo: 'configuracion',
    rutas: ['/app/configuracion'],
    paginas: [
      '/app/configuracion',
    ],
  },
  {
    codigo: 'notifications',
    rutas: ['/app/notificaciones'],
    paginas: [
      '/app/notificaciones',
      '/app/notificaciones/bandeja',
      '/app/notificaciones/alertas',
      '/app/notificaciones/reglas',
      '/app/notificaciones/canales',
      '/app/notificaciones/plantillas',
      '/app/notificaciones/logs',
    ],
  },
  {
    codigo: 'integrations',
    rutas: ['/app/integraciones'],
    paginas: [
      '/app/integraciones/conexiones',
      '/app/integraciones/eventos',
      '/app/integraciones/jobs',
      '/app/integraciones/mapeos',
      '/app/integraciones/api-keys',
      '/app/integraciones/webhooks-salientes',
    ],
  },
  {
    codigo: 'operations',
    rutas: ['/app/timeline'],
    paginas: [
      '/app/timeline',
      '/app/timeline/exportaciones',
    ],
  },
];

function coincide(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(prefijo + '/');
}

/** El módulo por código, o `undefined` si no está en el catálogo. */
export function rutasDeModulo(codigo: string): RutasModulo | undefined {
  return RUTAS_MODULOS.find((m) => m.codigo === codigo);
}

/**
 * Código del módulo al que pertenece una ruta (gana el prefijo más largo), o
 * `null` si la ruta no es de ningún módulo (Inicio, perfil, rutas internas).
 */
export function moduloDeRuta(pathname: string): string | null {
  let mejor: { codigo: string; largo: number } | null = null;
  for (const m of RUTAS_MODULOS) {
    for (const r of m.rutas) {
      if (coincide(pathname, r) && (!mejor || r.length > mejor.largo)) mejor = { codigo: m.codigo, largo: r.length };
    }
  }
  return mejor?.codigo ?? null;
}

/**
 * Página del módulo que contiene la ruta: la de `href` más largo que la
 * contenga (`/app/pos/ventas/123` → `/app/pos/ventas`, no `/app/pos`). `null`
 * si ninguna página la contiene (p. ej. una ruta de detalle sin página propia
 * fuera de las del catálogo).
 */
export function paginaDeRuta(pathname: string, codigo: string): string | null {
  let mejor: string | null = null;
  for (const href of rutasDeModulo(codigo)?.paginas ?? []) {
    if (coincide(pathname, href) && (!mejor || href.length > mejor.length)) mejor = href;
  }
  return mejor;
}

/** Cuántas páginas tiene el módulo en el catálogo (0 si no existe). */
export function cantidadPaginas(codigo: string): number {
  return rutasDeModulo(codigo)?.paginas.length ?? 0;
}
