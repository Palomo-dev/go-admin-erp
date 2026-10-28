/**
 * GO Assistant — guías de uso versionadas («¿cómo hago…?»).
 *
 * Cada ruta citada aquí es una página real de `src/app` (la prueba
 * `guias.test.ts` lo verifica: si una pantalla se mueve, la prueba falla antes
 * de que el asistente mande a alguien a una URL rota). Los pasos describen los
 * menús por su nombre; nada de botones inventados.
 *
 * `disponible: false` marca lo que todavía no existe en el ERP. El asistente
 * lo dice así, sin prometerlo.
 */

export interface RutaGuia {
  /** Ruta exacta del ERP (con `?query` opcional). Sin segmentos dinámicos salvo `[id]` documentado. */
  ruta: string;
  nombre: string;
}

export interface Guia {
  id: string;
  titulo: string;
  /** Palabras con las que la gente pregunta (minúsculas, sin tildes). */
  palabras: string[];
  pasos: string[];
  rutas: RutaGuia[];
  /** Permisos que suele hacer falta tener (códigos de `permissions`). */
  permisos?: string[];
  notas?: string[];
  /** `false` = la función descrita aún no existe; el asistente no la afirma. */
  disponible?: boolean;
}

export const RUTA_CARGOS = '/app/roles?vista=cargos';

/**
 * Métodos de pago por sucursal: hay un trabajo en curso que agrega
 * `branch_ids` a `organization_payment_methods` y un selector en
 * `PaymentMethodForm`. Mientras no esté en el formulario, la guía lo marca
 * como no disponible (la prueba compara esta constante con el formulario).
 */
export const METODOS_PAGO_POR_SUCURSAL_DISPONIBLE = false;

export const GUIAS: readonly Guia[] = [
  {
    id: 'metodos-pago',
    titulo: 'Crear o activar un método de pago',
    palabras: ['metodo de pago', 'metodos de pago', 'forma de pago', 'formas de pago', 'medio de pago', 'nequi', 'daviplata', 'tarjeta', 'efectivo', 'transferencia', 'qr'],
    pasos: [
      'Abre Finanzas > Métodos de pago.',
      'Activa uno de los métodos disponibles o crea uno propio con su nombre y tipo.',
      'Guarda. El método queda disponible en el POS y en las facturas de la organización.',
      'Para cobros con código QR, revisa las sesiones en Métodos de pago > Sesiones QR.',
    ],
    rutas: [
      { ruta: '/app/finanzas/metodos-pago', nombre: 'Finanzas > Métodos de pago' },
      { ruta: '/app/finanzas/metodos-pago/qr-sessions', nombre: 'Sesiones QR' },
    ],
  },
  {
    id: 'metodos-pago-sucursal',
    titulo: 'Método de pago solo para una sucursal',
    palabras: ['metodo de pago sucursal', 'metodo de pago por sucursal', 'pago para una sucursal', 'forma de pago sucursal', 'metodo de pago sede'],
    pasos: METODOS_PAGO_POR_SUCURSAL_DISPONIBLE
      ? [
          'Abre Finanzas > Métodos de pago y edita (o crea) el método.',
          'En el selector de sucursales, marca solo las sucursales donde se puede usar.',
          'Guarda. Las demás sucursales no lo ven en el POS.',
        ]
      : [
          'Hoy los métodos de pago son de toda la organización: no se pueden limitar a una sucursal.',
          'Puedes crear o activar el método en Finanzas > Métodos de pago; quedará en todas las sucursales.',
        ],
    rutas: [{ ruta: '/app/finanzas/metodos-pago', nombre: 'Finanzas > Métodos de pago' }],
    disponible: METODOS_PAGO_POR_SUCURSAL_DISPONIBLE,
    notas: METODOS_PAGO_POR_SUCURSAL_DISPONIBLE ? [] : ['La opción por sucursal está en desarrollo; no la prometas como disponible.'],
  },
  {
    id: 'promociones',
    titulo: 'Crear una promoción del POS',
    palabras: ['promocion', 'promociones', 'descuento automatico', 'oferta', '2x1', 'combo'],
    pasos: [
      'Abre POS > Promociones.',
      'Crea una nueva promoción: tipo, productos o categorías, vigencia y sucursales.',
      'Actívala. El POS la aplica sola a las líneas que cumplen la regla.',
    ],
    rutas: [
      { ruta: '/app/pos/promociones', nombre: 'POS > Promociones' },
      { ruta: '/app/pos/promociones/nuevo', nombre: 'Nueva promoción' },
    ],
  },
  {
    id: 'quitar-promocion',
    titulo: 'Dejar que el cajero quite una promoción de una línea',
    palabras: ['quitar promocion', 'quitar la promocion', 'quite una promocion', 'remover promocion', 'cajero promocion', 'pos.promotions.remove'],
    pasos: [
      'Hace falta el permiso «Quitar promoción de una línea» (pos.promotions.remove). Los administradores ya lo tienen.',
      'Un administrador abre Roles y permisos > Cargos y entra al cargo del cajero.',
      'En la matriz, módulo POS, marca «Quitar promoción de una línea» y guarda.',
      'El cajero vuelve a entrar al POS; en el carrito verá la acción para quitar la promoción de la línea.',
    ],
    rutas: [
      { ruta: RUTA_CARGOS, nombre: 'Roles y permisos > Cargos' },
      { ruta: '/app/roles/cargos/[id]', nombre: 'Editor del cargo' },
    ],
    permisos: ['pos.promotions.remove'],
  },
  {
    id: 'roles-permisos',
    titulo: 'Roles y permisos',
    palabras: ['rol', 'roles', 'permiso', 'permisos', 'acceso', 'que puede hacer'],
    pasos: [
      'Abre Roles y permisos.',
      'En la vista Roles, entra a un rol para ver y cambiar sus permisos por módulo.',
      'Usa «Comparar» para ver las diferencias entre dos roles.',
      'Para dar un permiso solo a un grupo de personas, hazlo en su cargo (vista Cargos): el cargo manda sobre el rol.',
    ],
    rutas: [
      { ruta: '/app/roles', nombre: 'Roles y permisos' },
      { ruta: '/app/roles/[id]', nombre: 'Editor del rol' },
      { ruta: '/app/roles?vista=comparar', nombre: 'Comparar roles' },
    ],
  },
  {
    id: 'cargos',
    titulo: 'Cargos (permisos por puesto)',
    palabras: ['cargo', 'cargos', 'puesto', 'puestos'],
    pasos: [
      'Abre Roles y permisos > Cargos y entra al cargo.',
      'Marca o desmarca permisos en la matriz; revisa los cambios y guarda.',
      'Los cargos se crean en Recursos humanos > Cargos y se asignan a cada persona.',
    ],
    rutas: [
      { ruta: RUTA_CARGOS, nombre: 'Roles y permisos > Cargos' },
      { ruta: '/app/roles/cargos/[id]', nombre: 'Editor del cargo' },
      { ruta: '/app/hrm/cargos', nombre: 'Recursos humanos > Cargos' },
      { ruta: '/app/hrm/cargos/nuevo', nombre: 'Nuevo cargo' },
    ],
  },
  {
    id: 'usuarios',
    titulo: 'Invitar usuarios y administrar miembros',
    palabras: ['usuario', 'usuarios', 'invitar', 'invitacion', 'miembro', 'miembros', 'empleado nuevo', 'dar acceso'],
    pasos: [
      'Abre Organización > Invitaciones y envía la invitación con el correo y el rol.',
      'Cuando la persona acepte, aparece en Organización > Miembros; ahí cambias su rol, cargo y sucursales.',
    ],
    rutas: [
      { ruta: '/app/organizacion/invitaciones', nombre: 'Organización > Invitaciones' },
      { ruta: '/app/organizacion/miembros', nombre: 'Organización > Miembros' },
    ],
  },
  {
    id: 'sucursales',
    titulo: 'Crear o editar sucursales',
    palabras: ['sucursal', 'sucursales', 'sede', 'sedes', 'tienda nueva', 'local'],
    pasos: [
      'Abre Organización > Sucursales.',
      'Crea la sucursal con su nombre y dirección, o edita una existente.',
      'Asigna las personas que trabajan en ella desde Organización > Miembros.',
    ],
    rutas: [
      { ruta: '/app/organizacion/sucursales', nombre: 'Organización > Sucursales' },
      { ruta: '/app/organizacion/miembros', nombre: 'Organización > Miembros' },
    ],
  },
  {
    id: 'cajas',
    titulo: 'Abrir, cerrar y revisar cajas',
    palabras: ['caja', 'cajas', 'abrir caja', 'cerrar caja', 'arqueo', 'turno de caja', 'cierre de caja'],
    pasos: [
      'Abre POS > Cajas.',
      'Abre la caja con el monto inicial; al terminar el turno, ciérrala con el conteo.',
      'Entra a una caja para ver sus movimientos y el cierre.',
    ],
    rutas: [
      { ruta: '/app/pos/cajas', nombre: 'POS > Cajas' },
      { ruta: '/app/pos/cajas/[id]', nombre: 'Detalle de la caja' },
    ],
  },
  {
    id: 'productos',
    titulo: 'Crear o importar productos',
    palabras: ['producto', 'productos', 'crear producto', 'importar productos', 'catalogo', 'categoria', 'categorias', 'precio'],
    pasos: [
      'Abre Inventario > Productos y crea un producto nuevo (nombre, categoría, precio, impuestos).',
      'Para cargar muchos a la vez, usa Inventario > Productos > Importar.',
      'Las categorías se administran en Inventario > Categorías.',
    ],
    rutas: [
      { ruta: '/app/inventario/productos', nombre: 'Inventario > Productos' },
      { ruta: '/app/inventario/productos/nuevo', nombre: 'Nuevo producto' },
      { ruta: '/app/inventario/productos/importar', nombre: 'Importar productos' },
      { ruta: '/app/inventario/categorias', nombre: 'Inventario > Categorías' },
    ],
  },
  {
    id: 'inventario',
    titulo: 'Existencias, ajustes y traslados de inventario',
    palabras: ['inventario', 'stock', 'existencias', 'ajuste', 'ajustar inventario', 'traslado', 'transferencia de inventario', 'kardex'],
    pasos: [
      'Consulta las existencias por sucursal en Inventario > Stock.',
      'Para corregir cantidades, crea un ajuste en Inventario > Ajustes.',
      'Para mover mercancía entre sucursales, crea una transferencia en Inventario > Transferencias.',
      'El historial de cada producto está en Inventario > Kardex.',
    ],
    rutas: [
      { ruta: '/app/inventario/stock', nombre: 'Inventario > Stock' },
      { ruta: '/app/inventario/ajustes/nuevo', nombre: 'Nuevo ajuste' },
      { ruta: '/app/inventario/transferencias/nuevo', nombre: 'Nueva transferencia' },
      { ruta: '/app/inventario/kardex', nombre: 'Inventario > Kardex' },
    ],
  },
  {
    id: 'facturacion-electronica',
    titulo: 'Facturación electrónica',
    palabras: ['factura electronica', 'facturacion electronica', 'dian', 'resolucion', 'factura', 'facturas'],
    pasos: [
      'Abre Finanzas > Facturación electrónica y completa la configuración del proveedor y la resolución.',
      'Las facturas de venta se crean en Finanzas > Facturas de venta y se envían desde su detalle.',
    ],
    rutas: [
      { ruta: '/app/finanzas/facturacion-electronica', nombre: 'Finanzas > Facturación electrónica' },
      { ruta: '/app/finanzas/facturas-venta', nombre: 'Finanzas > Facturas de venta' },
      { ruta: '/app/finanzas/facturas-venta/nuevo', nombre: 'Nueva factura de venta' },
    ],
  },
];

/** Minúsculas y sin tildes. */
export function normalizarGuia(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Puntaje: frase completa = 3 por palabra de la frase; palabra suelta = 1. */
function puntaje(guia: Guia, consulta: string): number {
  const palabrasConsulta = new Set(consulta.split(/[^a-z0-9.]+/).filter((p) => p.length > 2));
  let total = 0;
  for (const clave of guia.palabras) {
    if (consulta.includes(clave)) total += 3 * clave.split(' ').length;
    else if (clave.split(' ').every((p) => palabrasConsulta.has(p))) total += 2 * clave.split(' ').length;
  }
  for (const p of normalizarGuia(guia.titulo).split(' ')) if (p.length > 3 && palabrasConsulta.has(p)) total += 1;
  return total;
}

export function buscarGuias(consulta: string, max = 3): Guia[] {
  const q = normalizarGuia(consulta);
  if (!q) return [];
  const exacta = GUIAS.find((g) => g.id === q);
  if (exacta) return [exacta];
  return GUIAS.map((g) => ({ g, s: puntaje(g, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.g);
}
