import React from 'react';
import { Metadata } from 'next';
import { CampaignsList } from '@/components/crm/campaigns';

export const metadata: Metadata = {
  title: 'Gestión de Campañas | CRM - GoAdmin ERP',
  description: 'Administra y monitorea tus campañas de marketing por email y WhatsApp',
};

export default function CampanasPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <CampaignsList />
    </div>
  );
}
