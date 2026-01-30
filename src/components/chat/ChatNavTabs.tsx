'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Inbox,
  Radio,
  BookOpen,
  Bot,
  Settings,
  Wifi,
  Shield,
} from 'lucide-react';

interface NavTab {
  name: string;
  href: string;
  icon: React.ReactNode;
  matchPaths?: string[];
}

const chatTabs: NavTab[] = [
  {
    name: 'Bandeja',
    href: '/app/chat/bandeja',
    icon: <Inbox className="h-4 w-4" />,
    matchPaths: ['/app/chat/bandeja', '/app/chat/conversaciones'],
  },
  {
    name: 'Canales',
    href: '/app/chat/canales',
    icon: <Radio className="h-4 w-4" />,
    matchPaths: ['/app/chat/canales', '/app/chat/channels'],
  },
  {
    name: 'Conocimiento',
    href: '/app/chat/conocimiento',
    icon: <BookOpen className="h-4 w-4" />,
  },
  {
    name: 'IA',
    href: '/app/chat/ia/configuracion',
    icon: <Bot className="h-4 w-4" />,
    matchPaths: ['/app/chat/ia'],
  },
  {
    name: 'Configuración',
    href: '/app/chat/configuracion/etiquetas',
    icon: <Settings className="h-4 w-4" />,
    matchPaths: ['/app/chat/configuracion'],
  },
  {
    name: 'Widget',
    href: '/app/chat/widget/sesiones',
    icon: <Wifi className="h-4 w-4" />,
    matchPaths: ['/app/chat/widget'],
  },
  {
    name: 'Auditoría',
    href: '/app/chat/auditoria',
    icon: <Shield className="h-4 w-4" />,
  },
];

export function ChatNavTabs() {
  const pathname = usePathname();

  const isActive = (tab: NavTab) => {
    if (tab.matchPaths) {
      return tab.matchPaths.some((path) => pathname.startsWith(path));
    }
    return pathname.startsWith(tab.href);
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <nav className="flex space-x-1 px-4 overflow-x-auto" aria-label="Chat Navigation">
        {chatTabs.map((tab) => (
          <Link
            key={tab.name}
            href={tab.href}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
              isActive(tab)
                ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
            )}
          >
            {tab.icon}
            {tab.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default ChatNavTabs;
