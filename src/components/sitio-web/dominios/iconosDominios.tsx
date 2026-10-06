/**
 * Iconos de Dominios, en un solo lugar (Figma B/07 y B/02; Manual de marca
 * v2.0 §5). Extiende la tabla del módulo (`../ui/iconosSitio`): misma escala
 * de tamaños (14 · 16 · 20 · caja de 40), mismo trazo de 1,5 y la misma regla
 * de que el icono acompaña al texto y nunca lo reemplaza.
 *
 * Por qué una tabla: la misma acción lleva el MISMO icono en la cabecera, en
 * el «⋯» de la fila, en la barra móvil, en el detalle y en los diálogos. Quien
 * aprendió que el eslabón es «Conectar» y el carrito es «Comprar» lo
 * reconoce en todas las pantallas sin leer. Ningún archivo del área elige su
 * icono ni su tamaño por su cuenta: importa de aquí.
 */
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CircleCheck,
  CircleX,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Loader2,
  Lock,
  Mail,
  Network,
  RefreshCw,
  Search,
  Share2,
  ShoppingCart,
  Star,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { CLASE_TAMANO_ICONO, ICONO_ACCION_SITIO, ICONO_TAREA_SITIO, TRAZO_ICONO, type TamanoIcono } from '../ui/iconosSitio';
import type { ResultadoVerificacion, TipoDominio } from './tiposDominios';

/**
 * Icono de la caja del PageHeader de /dominios y /dominios/[id]: el globo del
 * módulo, como en las capturas B/07-01, 07-03 y 07-21. Así el eslabón queda
 * solo para «Conectar» y para el tipo de dominio en las filas: un icono, un
 * significado.
 */
export const ICONO_PAGINA_DOMINIOS: LucideIcon = ICONO_TAREA_SITIO.sitio;

/** Volver a revisar el DNS: el mismo icono en el botón de la fila, el «⋯», el detalle y el diálogo (B/07-10, 07-21). */
const VERIFICAR: LucideIcon = RefreshCw;

/**
 * Acciones. Una acción = un icono, esté donde esté:
 * eslabón = conectar · carrito = comprar · flechas en círculo = volver a
 * revisar · estrella = principal · flecha que sale = abrir el sitio.
 * `revisar` (botón de la fila) y `verificar` («Verificar ahora» del «⋯» y del
 * detalle) abren el MISMO paso del diálogo: comparten icono a propósito.
 */
export const ICONO_ACCION_DOMINIO = {
  actualizar: RefreshCw,
  conectar: Link2,
  comprar: ShoppingCart,
  buscar: Search,
  verDetalle: Eye,
  cambiarSubdominio: Globe,
  principal: Star,
  verificar: VERIFICAR,
  revisar: VERIFICAR,
  registros: Network,
  renovar: CalendarClock,
  copiar: ICONO_ACCION_SITIO.copiar,
  copiado: ICONO_ACCION_SITIO.copiado,
  transferir: Share2,
  quitar: Trash2,
  verSitio: ExternalLink,
  continuar: ArrowRight,
  confirmar: ICONO_ACCION_SITIO.hecho,
  abrir: ICONO_ACCION_SITIO.abrir,
  info: ICONO_ACCION_SITIO.info,
  pagar: Lock,
  tarjeta: CreditCard,
  guia: BookOpen,
  correo: Mail,
  enCurso: Loader2,
} as const satisfies Record<string, LucideIcon>;
export type AccionDominioIcono = keyof typeof ICONO_ACCION_DOMINIO;

/**
 * Tipo de dirección (columna Dominio de B/07-01 y tarjeta móvil de B/07-25):
 * el globo es la dirección gratis de GO Admin; el eslabón, cualquier dominio
 * propio (comprado aquí, externo o su alias www), como en la captura.
 */
export const ICONO_TIPO_DOMINIO: Record<TipoDominio, LucideIcon> = {
  subdominio: Globe,
  comprado: Link2,
  propio: Link2,
  alias_www: Link2,
};

/** Tarjetas del detalle (B/07-21) y de ayuda bajo la tabla (B/07-01). */
export const ICONO_TARJETA_DOMINIO = {
  conexion: Link2,
  ssl: Lock,
  redirecciones: ArrowRight,
  renovacion: CalendarClock,
  transferir: Share2,
  quitar: Trash2,
  ayudaPrincipal: Star,
  ayudaRenovaciones: CalendarClock,
  ayudaCorreo: Mail,
  conectarMio: Link2,
  comprarAqui: ShoppingCart,
  subdominio: Globe,
} as const satisfies Record<string, LucideIcon>;

/**
 * Marcas de estado en filas y pasos (SSL emitido en la lista, B/07-01; pasos
 * hechos, en curso y pendientes del flujo, B/07-08 y 07-15).
 */
export const ICONO_ESTADO_PASO = {
  hecho: ICONO_ACCION_SITIO.hecho,
  correcto: ICONO_ACCION_SITIO.correcto,
  pendiente: ICONO_ACCION_SITIO.pendiente,
} as const satisfies Record<string, LucideIcon>;

/** SSL emitido en la columna de la lista (B/07-01). */
export const ICONO_SSL_EMITIDO: LucideIcon = ICONO_ESTADO_PASO.correcto;

/**
 * Icono en círculo de cada resultado de un flujo (B/07-09…07-12, 07-17…07-20)
 * con el tono que lo acompaña. El color dice «bien / cuidado / mal» y el
 * icono dice qué pasó: candado = el dominio es de otro sitio; reloj = falta
 * tiempo; globo en rojo = la dirección apunta a otro lado.
 */
export const ICONO_RESULTADO_CONECTAR: Record<Exclude<ResultadoVerificacion, 'verificando'>, { icono: LucideIcon; tono: 'exito' | 'peligro' | 'advertencia' | 'marca' }> = {
  activo: { icono: CircleCheck, tono: 'exito' },
  mal_configurado: { icono: Globe, tono: 'peligro' },
  en_uso: { icono: Lock, tono: 'advertencia' },
  propagando: { icono: Clock, tono: 'marca' },
};

export const ICONO_RESULTADO_COMPRA = {
  /** Indicador de carga en el círculo, como en B/07-16 (gira con `girando`). */
  comprando: { icono: ICONO_ACCION_DOMINIO.enCurso, tono: 'marca' },
  listo: { icono: CircleCheck, tono: 'exito' },
  noDisponible: { icono: CircleX, tono: 'peligro' },
  pagoRechazado: { icono: CreditCard, tono: 'peligro' },
  registrador: { icono: TriangleAlert, tono: 'advertencia' },
  errorGeneral: { icono: TriangleAlert, tono: 'peligro' },
} as const satisfies Record<string, { icono: LucideIcon; tono: 'exito' | 'peligro' | 'advertencia' | 'marca' }>;

export interface IconoDominioProps {
  icono: LucideIcon;
  /** Escala del módulo: `meta` 14 · `base` 16 (botones, por defecto) · `fila` 20 (móvil). */
  tamano?: TamanoIcono;
  /** Gira (cargando, revisando); se detiene con movimiento reducido. */
  girando?: boolean;
  className?: string;
}

/**
 * Icono suelto del área: decorativo (`aria-hidden`), trazo 1,5 y tamaño de
 * la escala. El texto de al lado dice lo mismo.
 */
export function IconoDominio({ icono: Icono, tamano = 'base', girando, className }: IconoDominioProps) {
  return (
    <Icono
      aria-hidden="true"
      data-tamano={tamano}
      strokeWidth={TRAZO_ICONO}
      className={cn('shrink-0', CLASE_TAMANO_ICONO[tamano], girando && 'animate-spin motion-reduce:animate-none', className)}
    />
  );
}

/** Icono de un botón que espera: el de la acción o, mientras trabaja, el que gira. */
export function IconoBoton({ icono, ocupado, tamano = 'base' }: { icono: LucideIcon; ocupado?: boolean; tamano?: TamanoIcono }) {
  return ocupado ? <IconoDominio icono={ICONO_ACCION_DOMINIO.enCurso} tamano={tamano} girando /> : <IconoDominio icono={icono} tamano={tamano} />;
}
