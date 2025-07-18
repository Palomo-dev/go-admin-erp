import React from 'react';
import TaxesIndexPage from '@/components/finanzas/impuestos/TaxesIndexPage';
import { Metadata } from 'next';

// Metadatos para SEO
export const metadata: Metadata = {
  title: 'Gestión de Impuestos | Finanzas',
  description: 'Administra los impuestos de tu organización.',
};

// Página principal de gestión de impuestos
export default function TaxesPage() {
  return <TaxesIndexPage />;
}
