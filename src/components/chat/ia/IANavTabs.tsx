'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Settings, FlaskConical, ListChecks } from 'lucide-react';

const iaTabs = [
  {
    name: 'Configuración',
    href: '/app/chat/ia/configuracion',
    icon: <Settings className="h-4 w-4" />,
  },
  {
    name: 'Laboratorio',
    href: '/app/chat/ia/laboratorio',
    icon: <FlaskConical className="h-4 w-4" />,
  },
  {
    name: 'Trabajos',
    href: '/app/chat/ia/trabajos',
    icon: <ListChecks className="h-4 w-4" />,
  },
];

export function IANavTabs() {
  const pathname = usePathname();

  return (
    <div className="flex space-x-2 mb-6">
      {iaTabs.map((tab) => (
        <Link
          key={tab.name}
          href={tab.href}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            pathname === tab.href
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
          )}
        >
          {tab.icon}
          {tab.name}
        </Link>
      ))}
    </div>
  );
}

export default IANavTabs;
