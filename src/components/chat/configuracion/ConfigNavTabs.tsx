'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Tags, MessageSquareText, Key } from 'lucide-react';

const configTabs = [
  {
    name: 'Etiquetas',
    href: '/app/chat/configuracion/etiquetas',
    icon: <Tags className="h-4 w-4" />,
  },
  {
    name: 'Respuestas Rápidas',
    href: '/app/chat/configuracion/respuestas-rapidas',
    icon: <MessageSquareText className="h-4 w-4" />,
  },
  {
    name: 'Llaves API',
    href: '/app/chat/configuracion/llaves-api',
    icon: <Key className="h-4 w-4" />,
  },
];

export function ConfigNavTabs() {
  const pathname = usePathname();

  return (
    <div className="flex space-x-2 mb-6">
      {configTabs.map((tab) => (
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

export default ConfigNavTabs;
