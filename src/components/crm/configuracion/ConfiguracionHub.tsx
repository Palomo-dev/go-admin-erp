'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  Tags,
  Key,
  Globe,
  ArrowLeft,
  ChevronRight,
  Settings,
} from 'lucide-react';

interface ConfigCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  bgColor: string;
}

const configCards: ConfigCard[] = [
  {
    id: 'canales',
    title: 'Canales',
    description: 'Gestiona canales de comunicación: WhatsApp, Email, Webchat, etc.',
    icon: <MessageSquare className="h-6 w-6" />,
    href: '/app/crm/configuracion/canales',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    id: 'etiquetas',
    title: 'Etiquetas',
    description: 'Catálogo de etiquetas para clasificar conversaciones.',
    icon: <Tags className="h-6 w-6" />,
    href: '/app/crm/configuracion/etiquetas',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  {
    id: 'api-keys',
    title: 'API Keys',
    description: 'Gestiona las llaves de API para integraciones externas.',
    icon: <Key className="h-6 w-6" />,
    href: '/app/crm/configuracion/api-keys',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  {
    id: 'widget',
    title: 'Widget Web',
    description: 'Configura el widget de chat para tu sitio web.',
    icon: <Globe className="h-6 w-6" />,
    href: '/app/crm/configuracion/widget',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
];

export default function ConfiguracionHub() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/app/crm')}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Configuración del CRM
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Gestiona canales, etiquetas, reglas y configuraciones
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {configCards.map((card) => (
            <Card
              key={card.id}
              className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow cursor-pointer group"
              onClick={() => router.push(card.href)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-lg ${card.bgColor}`}>
                    <span className={card.color}>{card.icon}</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {card.title}
                </CardTitle>
                <CardDescription className="text-gray-500 dark:text-gray-400">
                  {card.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
