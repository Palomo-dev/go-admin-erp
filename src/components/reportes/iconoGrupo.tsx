import {
  BedDouble,
  BookOpen,
  Building2,
  Dumbbell,
  FileBarChart,
  Landmark,
  MessageCircle,
  Package,
  ParkingCircle,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** Iconos de los grupos del catálogo (el nombre lo trae `GrupoMeta.icono`). */
const ICONOS: Record<string, LucideIcon> = {
  BookOpen,
  Landmark,
  ShoppingCart,
  Package,
  ShoppingBag,
  UserCog,
  Users,
  MessageCircle,
  Building2,
  BedDouble,
  ParkingCircle,
  Dumbbell,
  Truck,
};

export function iconoDeGrupo(nombre: string): LucideIcon {
  return ICONOS[nombre] ?? FileBarChart;
}

export function IconoGrupo({ nombre, className }: { nombre: string; className?: string }) {
  const Icono = iconoDeGrupo(nombre);
  return <Icono aria-hidden className={className} strokeWidth={1.5} />;
}
