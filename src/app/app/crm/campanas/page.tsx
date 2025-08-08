'use client';

import React from 'react';
import { CampaignsList } from '@/components/crm/campaigns';
import LanguageSelector from '@/components/crm/campaigns/LanguageSelector';
import { useTranslation } from '@/lib/i18n';

export default function CampanasPage() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header con título y selector de idioma */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('campaigns.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t('campaigns.description')}
          </p>
        </div>
        <LanguageSelector />
      </div>
      
      <CampaignsList />
    </div>
  );
}
