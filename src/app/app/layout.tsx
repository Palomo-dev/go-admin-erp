'use client';
import React from 'react';
import { AppLayout } from '@/components/app-layout/AppLayout';

// Componente de layout simplificado que utiliza el AppLayout refactorizado
export default function AppLayoutPage({
  children,
}: {
  children: React.ReactNode;
}) {
  // Simplemente renderizar el componente AppLayout refactorizado
  return <AppLayout>{children}</AppLayout>;
}
