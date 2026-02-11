'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { XMarkIcon, CalculatorIcon } from '@heroicons/react/24/outline';
import EnterpriseConfigSelector, { EnterpriseConfig } from '@/components/auth/EnterpriseConfigSelector';

interface EnterpriseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: number;
  billingPeriod?: 'monthly' | 'yearly';
  currentConfig?: EnterpriseConfig;
  onSave: (config: EnterpriseConfig) => void;
}

export default function EnterpriseConfigModal({
  isOpen,
  onClose,
  orgId,
  billingPeriod = 'monthly',
  currentConfig,
  onSave,
}: EnterpriseConfigModalProps) {
  const [config, setConfig] = useState<EnterpriseConfig>({
    modulesCount: 6,
    branchesCount: 5,
    usersCount: 10,
    aiCredits: 10000,
    selectedModules: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    } else {
      loadCurrentConfig();
    }
  }, [currentConfig, orgId]);

  const loadCurrentConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('metadata')
        .eq('organization_id', orgId)
        .single();

      if (error) throw error;

      const customConfig = data?.metadata?.custom_config;
      if (customConfig) {
        setConfig({
          modulesCount: customConfig.modules_count || 6,
          branchesCount: customConfig.branches_count || 5,
          usersCount: customConfig.users_count || 10,
          aiCredits: customConfig.ai_credits || 10000,
          selectedModules: customConfig.selected_modules || [],
        });
      }
    } catch (err) {
      console.error('Error loading config:', err);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/organization/enterprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          config: {
            modules_count: config.modulesCount,
            branches_count: config.branchesCount,
            users_count: config.usersCount,
            ai_credits: config.aiCredits || 0,
            selected_modules: config.selectedModules,
            billing_period: billingPeriod,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al guardar configuración');
      }

      onSave(config);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <CalculatorIcon className="w-5 h-5 text-blue-600" />
                Configuración Enterprise
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

            <EnterpriseConfigSelector
              config={config}
              onChange={setConfig}
              billingPeriod={billingPeriod}
            />
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar Configuración'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
