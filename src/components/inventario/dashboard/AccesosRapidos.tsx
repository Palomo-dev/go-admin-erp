'use client';

import { FC } from 'react';
import { cn } from '@/utils/Utils';
import Link from 'next/link';
import { 
  Package, 
  FolderTree, 
  ArrowRightLeft, 
  ShoppingCart, 
  Truck, 
  ClipboardList,
  Users,
  FileBarChart,
  Plus,
  Layers,
  Package2,
  Image,
  BarChart3
} from 'lucide-react';

interface QuickAccessItem {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'indigo';
}

interface AccesosRapidosProps {
  className?: string;
}

const quickAccessItems: QuickAccessItem[] = [
  {
    title: 'Productos',
    description: 'Gestionar catálogo',
    href: '/app/inventario/productos',
    icon: <Package className="h-6 w-6" />,
    color: 'blue',
  },
  {
    title: 'Nuevo Producto',
    description: 'Agregar al catálogo',
    href: '/app/inventario/productos/nuevo',
    icon: <Plus className="h-6 w-6" />,
    color: 'green',
  },
  {
    title: 'Categorías',
    description: 'Organizar productos',
    href: '/app/inventario/categorias',
    icon: <FolderTree className="h-6 w-6" />,
    color: 'purple',
  },
  {
    title: 'Proveedores',
    description: 'Gestionar proveedores',
    href: '/app/inventario/proveedores',
    icon: <Users className="h-6 w-6" />,
    color: 'indigo',
  },
  {
    title: 'Transferencias',
    description: 'Entre sucursales',
    href: '/app/inventario/transferencias',
    icon: <ArrowRightLeft className="h-6 w-6" />,
    color: 'amber',
  },
  {
    title: 'Compras',
    description: 'Órdenes de compra',
    href: '/app/inventario/ordenes-compra',
    icon: <ShoppingCart className="h-6 w-6" />,
    color: 'green',
  },
  {
    title: 'Variantes',
    description: 'Tipos y valores',
    href: '/app/inventario/variantes/tipos',
    icon: <Layers className="h-6 w-6" />,
    color: 'purple',
  },
  {
    title: 'Lotes',
    description: 'Trazabilidad',
    href: '/app/inventario/lotes',
    icon: <Package2 className="h-6 w-6" />,
    color: 'amber',
  },
  {
    title: 'Imágenes',
    description: 'Biblioteca',
    href: '/app/inventario/imagenes',
    icon: <Image className="h-6 w-6" />,
    color: 'indigo',
  },
  {
    title: 'Reportes',
    description: 'Análisis y datos',
    href: '/app/inventario/reportes',
    icon: <BarChart3 className="h-6 w-6" />,
    color: 'blue',
  },
];

const colorStyles = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30',
    icon: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30',
    icon: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30',
    icon: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30',
    icon: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800',
  },
};

const AccesosRapidos: FC<AccesosRapidosProps> = ({ className }) => {
  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700",
      className
    )}>
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-blue-500" />
        Accesos Rápidos
      </h3>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {quickAccessItems.map((item) => {
          const styles = colorStyles[item.color];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "p-4 rounded-lg border transition-all duration-200 flex flex-col items-center text-center group",
                styles.bg,
                styles.border
              )}
            >
              <div className={cn(
                "mb-2 p-2 rounded-full bg-white dark:bg-gray-800 shadow-sm group-hover:scale-110 transition-transform",
                styles.icon
              )}>
                {item.icon}
              </div>
              <span className="font-medium text-sm text-gray-900 dark:text-white">
                {item.title}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {item.description}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default AccesosRapidos;
