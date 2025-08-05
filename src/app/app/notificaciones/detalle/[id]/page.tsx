/**
 * Página de detalle de una notificación específica
 * Ruta: /app/notificaciones/detalle/[id]
 */

'use client';

import React from 'react';
import { NotificationDetailView } from '@/components/app/notificaciones/detalle';

interface NotificationDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function NotificationDetailPage({ params }: NotificationDetailPageProps) {
  // Unwrap params usando React.use() según las nuevas versiones de Next.js
  const resolvedParams = React.use(params);
  
  return (
    <NotificationDetailView 
      notificationId={resolvedParams.id}
      showBackButton={true}
    />
  );
}
