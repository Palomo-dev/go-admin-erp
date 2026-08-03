'use client';

import React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ExternalLink,
  Link2,
  Key,
  Send,
  GitMerge,
  Activity,
  Briefcase,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface DocLink {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: string;
}

export function DocumentationSection() {
  const quickLinks: DocLink[] = [
    {
      title: 'Crear una Conexión',
      description: 'Aprende a conectar proveedores externos',
      href: '/app/integraciones/conexiones/nueva',
      icon: <Link2 className="h-5 w-5" />,
      color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Configurar API Keys',
      description: 'Genera claves para acceso programático',
      href: '/app/integraciones/api-keys',
      icon: <Key className="h-5 w-5" />,
      color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
    },
    {
      title: 'Webhooks Salientes',
      description: 'Notifica eventos a sistemas externos',
      href: '/app/integraciones/webhooks-salientes',
      icon: <Send className="h-5 w-5" />,
      color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/30',
    },
    {
      title: 'Mapeos de Objetos',
      description: 'Relaciona IDs externos con internos',
      href: '/app/integraciones/mapeos',
      icon: <GitMerge className="h-5 w-5" />,
      color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30',
    },
    {
      title: 'Monitor de Eventos',
      description: 'Revisa logs y auditoría',
      href: '/app/integraciones/eventos',
      icon: <Activity className="h-5 w-5" />,
      color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Gestión de Jobs',
      description: 'Monitorea trabajos de sincronización',
      href: '/app/integraciones/jobs',
      icon: <Briefcase className="h-5 w-5" />,
      color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  return (
    <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          Documentación y Accesos Rápidos
        </CardTitle>
        <CardDescription className="dark:text-gray-400">
          Guías internas y enlaces útiles del módulo de integraciones
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-start gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all"
            >
              <div className={`p-2 rounded-lg ${link.color}`}>
                {link.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {link.title}
                  </p>
                  <ExternalLink className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                  {link.description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Sección de tips */}
        <div className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">💡 Tips de uso</h4>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
            <li>• Configura webhooks para recibir notificaciones en tiempo real</li>
            <li>• Usa mapeos para mantener consistencia entre sistemas</li>
            <li>• Revisa los eventos periódicamente para detectar errores</li>
            <li>• Rota las API keys regularmente por seguridad</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default DocumentationSection;
