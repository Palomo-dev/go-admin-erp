'use client';

/**
 * Íconos de Phosphor en el editor (Figma «16 Sitio web» 2852:70951, propuesta 8).
 *
 * El editor los pinta con `react-icons/pi` (ya instalado: los mismos 1.512 íconos de Phosphor 2.1
 * en sus 6 pesos). El módulo pesa varios MB, así que se carga UNA vez y solo cuando hace falta
 * (al abrir el selector o al ver un ícono del catálogo nuevo); mientras llega, un cuadro gris del
 * mismo tamaño. La tienda no usa esto: descarga cada dibujo de su ruta `/api/iconos/…`.
 *
 * `IconoVista` repite en el editor lo que pinta la tienda (GlifoTienda): el mismo `dibujoGlifo`,
 * la misma sombra y el mismo fondo, para la vista previa en vivo.
 */
import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { dibujoGlifo, radioFondoGlifo, sombraGlifo, type EstiloGlifos, type PesoGlifo, type RefGlifo } from '@/lib/website/v2/glifosTienda';
import { textoSobreAcento } from '@/lib/website/v2/tokensEstilo';

type ComponentePi = ComponentType<{ className?: string; style?: CSSProperties; 'aria-hidden'?: boolean | 'true' | 'false' }>;
type ModuloPi = Record<string, ComponentePi>;

const SUFIJO: Readonly<Record<PesoGlifo, string>> = { regular: '', thin: 'Thin', light: 'Light', bold: 'Bold', fill: 'Fill', duotone: 'Duotone' };

let promesa: Promise<ModuloPi> | null = null;
let cargado: ModuloPi | null = null;

/** Carga (una sola vez) los íconos de Phosphor del editor. */
export function cargarPhosphor(): Promise<ModuloPi> {
  if (!promesa) {
    promesa = import('react-icons/pi').then((m) => {
      cargado = m as unknown as ModuloPi;
      return cargado;
    });
  }
  return promesa;
}

/** Los íconos de Phosphor ya cargados, o `null` mientras llegan (y los pide). */
export function usePhosphor(): ModuloPi | null {
  const [modulo, setModulo] = useState<ModuloPi | null>(cargado);
  useEffect(() => {
    if (modulo) return;
    let vivo = true;
    cargarPhosphor().then((m) => vivo && setModulo(m)).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [modulo]);
  return modulo;
}

/** Un ícono de Phosphor por nombre y peso. Sin cargar (o con un nombre que no existe), un cuadro gris. */
export function GlifoPhosphor({ nombre, peso = 'regular', className, style }: { nombre: string; peso?: PesoGlifo; className?: string; style?: CSSProperties }) {
  const pi = usePhosphor();
  const Comp = pi?.[`Pi${nombre}${SUFIJO[peso]}`];
  if (!Comp) return <span aria-hidden="true" className={cn('inline-block shrink-0 rounded-sm bg-subtle', className)} style={style} data-glifo-cargando={nombre} />;
  return <Comp aria-hidden={true} className={cn('shrink-0', className)} style={style} />;
}

const comoLucideCache = new Map<string, LucideIcon>();

/**
 * Un ícono de Phosphor con la forma de un ícono de Lucide (para piezas del kit que reciben
 * `icono: LucideIcon`, como la fila del menú).
 */
export function phosphorComoLucide(nombre: string, peso: PesoGlifo = 'regular'): LucideIcon {
  const clave = `${nombre}:${peso}`;
  const guardado = comoLucideCache.get(clave);
  if (guardado) return guardado;
  const Comp = (({ className, style }: LucideProps) => <GlifoPhosphor nombre={nombre} peso={peso} className={className} style={style} />) as unknown as LucideIcon;
  comoLucideCache.set(clave, Comp);
  return Comp;
}

/**
 * Lo que pinta la tienda para un ícono (Lucide o Phosphor) con el «Estilo de los íconos». Mismo
 * criterio que GlifoTienda en goadmin-websites.
 */
export function IconoVista({
  glifo,
  nombre,
  Lucide,
  estilo,
  className = 'size-5',
  color,
  fondo,
}: {
  glifo?: RefGlifo | null;
  nombre?: string | null;
  Lucide: LucideIcon;
  estilo?: EstiloGlifos | null;
  className?: string;
  color?: string | null;
  /** Fondo cuando el estilo no trae color propio (el activo del menú: la marca). */
  fondo?: string | null;
}) {
  const d = dibujoGlifo(glifo, nombre, estilo);
  const bg = estilo?.bg ?? null;
  const colorFondo = bg ? (bg.color ?? fondo ?? null) : null;
  const sombra = sombraGlifo(estilo, Boolean(bg));
  const estiloSvg: CSSProperties = {
    ...(estilo?.size ? { width: estilo.size, height: estilo.size } : {}),
    ...(color && !colorFondo ? { color } : {}),
    ...(sombra && !bg ? { filter: sombra } : {}),
  };
  const svg =
    d.tipo === 'phosphor' ? (
      <GlifoPhosphor nombre={d.name} peso={d.weight} className={className} style={estiloSvg} />
    ) : (
      <Lucide
        aria-hidden="true"
        className={cn('shrink-0', className)}
        strokeWidth={d.trazo?.strokeWidth ?? 2}
        {...(d.trazo?.fill ? { fill: d.trazo.fill } : {})}
        {...(d.trazo?.fillOpacity !== undefined ? { fillOpacity: d.trazo.fillOpacity } : {})}
        style={estiloSvg}
      />
    );
  if (!bg) return svg;
  return (
    <span
      data-glifo-fondo={bg.shape}
      className="inline-flex shrink-0 items-center justify-center p-1.5 leading-none"
      style={{
        borderRadius: radioFondoGlifo(bg.shape),
        backgroundColor: colorFondo ?? 'color-mix(in srgb, currentColor 12%, transparent)',
        ...(colorFondo ? { color: textoSobreAcento(colorFondo) } : {}),
        ...(sombra ? { boxShadow: sombra } : {}),
      }}
    >
      {svg}
    </span>
  );
}
