'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, CreditCard, MessageSquare, Globe, Truck, Share2, Megaphone, Check, ChevronRight, Hotel } from 'lucide-react';
import { IntegrationProvider, IntegrationConnector } from '@/lib/services/integrationsService';
import { cn } from '@/lib/utils';

interface StepProviderConnectorProps {
  providers: IntegrationProvider[];
  connectors: IntegrationConnector[];
  selectedProvider: IntegrationProvider | null;
  selectedConnector: IntegrationConnector | null;
  onSelectProvider: (provider: IntegrationProvider) => void;
  onSelectConnector: (connector: IntegrationConnector) => void;
}

// Configuración de logos reales por código de proveedor (usando CDNs confiables)
const PROVIDER_LOGOS: Record<string, { logoUrl: string; bgColor: string; borderColor: string }> = {
  stripe: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
    bgColor: 'bg-[#635BFF]/10',
    borderColor: 'border-[#635BFF]/30',
  },
  mercadopago: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg',
    bgColor: 'bg-[#00B1EA]/10',
    borderColor: 'border-[#00B1EA]/30',
  },
  paypal: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg',
    bgColor: 'bg-[#003087]/10',
    borderColor: 'border-[#003087]/30',
  },
  payu: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/PayU_logo.svg/1200px-PayU_logo.svg.png',
    bgColor: 'bg-[#A6C307]/10',
    borderColor: 'border-[#A6C307]/30',
  },
  wompi: {
    logoUrl: 'https://wompi.com/assets/images/logo-wompi-all-green.svg',
    bgColor: 'bg-[#34C759]/10',
    borderColor: 'border-[#34C759]/30',
  },
  rappi: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Rappi_logo.png',
    bgColor: 'bg-[#FF441F]/10',
    borderColor: 'border-[#FF441F]/30',
  },
  ifood: {
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/ifood-1.svg',
    bgColor: 'bg-[#EA1D2C]/10',
    borderColor: 'border-[#EA1D2C]/30',
  },
  ubereats: {
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/uber-eats-1.svg',
    bgColor: 'bg-[#06C167]/10',
    borderColor: 'border-[#06C167]/30',
  },
  whatsapp: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
    bgColor: 'bg-[#25D366]/10',
    borderColor: 'border-[#25D366]/30',
  },
  twilio: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Twilio-logo-red.svg',
    bgColor: 'bg-[#F22F46]/10',
    borderColor: 'border-[#F22F46]/30',
  },
  sendgrid: {
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/sendgrid-1.svg',
    bgColor: 'bg-[#1A82E2]/10',
    borderColor: 'border-[#1A82E2]/30',
  },
  meta: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg',
    bgColor: 'bg-[#0081FB]/10',
    borderColor: 'border-[#0081FB]/30',
  },
  tiktok: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg',
    bgColor: 'bg-black/10 dark:bg-white/10',
    borderColor: 'border-black/20 dark:border-white/20',
  },
  google_ads: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Google_Ads_logo.svg',
    bgColor: 'bg-[#4285F4]/10',
    borderColor: 'border-[#4285F4]/30',
  },
  booking: {
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/bookingcom-1.svg',
    bgColor: 'bg-[#003580]/10',
    borderColor: 'border-[#003580]/30',
  },
  airbnb: {
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Airbnb_Logo_B%C3%A9lo.svg',
    bgColor: 'bg-[#FF5A5F]/10',
    borderColor: 'border-[#FF5A5F]/30',
  },
};

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bgColor: string }> = {
  payments: {
    icon: <CreditCard className="h-4 w-4" />,
    label: 'Pagos',
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  messaging: {
    icon: <MessageSquare className="h-4 w-4" />,
    label: 'Mensajería',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  ota: {
    icon: <Hotel className="h-4 w-4" />,
    label: 'OTA',
    color: 'text-purple-700 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  delivery: {
    icon: <Truck className="h-4 w-4" />,
    label: 'Delivery',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  social: {
    icon: <Share2 className="h-4 w-4" />,
    label: 'Social',
    color: 'text-pink-700 dark:text-pink-400',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',
  },
  ads: {
    icon: <Megaphone className="h-4 w-4" />,
    label: 'Publicidad',
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
};

export function StepProviderConnector({
  providers,
  connectors,
  selectedProvider,
  selectedConnector,
  onSelectProvider,
  onSelectConnector,
}: StepProviderConnectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filtrar proveedores
  const filteredProviders = providers.filter((provider) => {
    const matchesSearch = provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      provider.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || provider.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Obtener categorías únicas
  const categories = Array.from(new Set(providers.map((p) => p.category)));

  // Obtener conectores del proveedor seleccionado
  const providerConnectors = connectors.filter(
    (c) => c.provider_id === selectedProvider?.id
  );

  return (
    <div className="space-y-6">
      {/* Selección de Proveedor */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Selecciona un Proveedor
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Elige el servicio con el que deseas conectarte
          </p>
        </div>

        {/* Búsqueda y filtros */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar proveedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge
              variant={selectedCategory === null ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(null)}
            >
              Todos
            </Badge>
            {categories.map((category) => {
              const config = CATEGORY_CONFIG[category] || {};
              return (
                <Badge
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  className={cn('cursor-pointer', selectedCategory === category && config.color)}
                  onClick={() => setSelectedCategory(category)}
                >
                  {config.label || category}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Grid de proveedores */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredProviders.map((provider) => {
            const isSelected = selectedProvider?.id === provider.id;
            const categoryConfig = CATEGORY_CONFIG[provider.category] || {};
            const logoConfig = PROVIDER_LOGOS[provider.code];

            return (
              <div
                key={provider.id}
                className={cn(
                  'relative p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg group',
                  logoConfig?.bgColor || 'bg-gray-50 dark:bg-gray-800',
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/50 shadow-md'
                    : `${logoConfig?.borderColor || 'border-gray-200 dark:border-gray-700'} hover:border-gray-400`
                )}
                onClick={() => onSelectProvider(provider)}
              >
                {/* Check mark */}
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-0.5">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}

                {/* Logo */}
                <div className="w-12 h-12 rounded-lg bg-white dark:bg-gray-900 shadow-sm flex items-center justify-center mb-3 overflow-hidden">
                  {logoConfig?.logoUrl ? (
                    <img
                      src={logoConfig.logoUrl}
                      alt={provider.name}
                      className="w-8 h-8 object-contain"
                    />
                  ) : provider.logo_url ? (
                    <img
                      src={provider.logo_url}
                      alt={provider.name}
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    <div className={cn('', categoryConfig.color)}>
                      {categoryConfig.icon || <Globe className="h-5 w-5 text-gray-400" />}
                    </div>
                  )}
                </div>

                {/* Info */}
                <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                  {provider.name}
                </p>
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-xs mt-1',
                    categoryConfig.bgColor,
                    categoryConfig.color
                  )}
                >
                  {categoryConfig.icon}
                  <span className="ml-1">{categoryConfig.label || provider.category}</span>
                </Badge>
              </div>
            );
          })}
        </div>

        {filteredProviders.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No se encontraron proveedores
          </div>
        )}
      </div>

      {/* Selección de Conector (si hay proveedor seleccionado) */}
      {selectedProvider && providerConnectors.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Selecciona un Conector
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {selectedProvider.name} tiene {providerConnectors.length} conector(es) disponible(s)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {providerConnectors.map((connector) => {
              const isSelected = selectedConnector?.id === connector.id;

              return (
                <Card
                  key={connector.id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md',
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-50'
                      : 'hover:border-gray-400 dark:hover:border-gray-500'
                  )}
                  onClick={() => onSelectConnector(connector)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {connector.name}
                        </p>
                        
                        {/* Capacidades */}
                        <div className="flex flex-wrap gap-1">
                          {connector.capabilities?.webhooks && (
                            <Badge variant="outline" className="text-xs">Webhooks</Badge>
                          )}
                          {connector.capabilities?.pull && (
                            <Badge variant="outline" className="text-xs">Pull</Badge>
                          )}
                          {connector.capabilities?.push && (
                            <Badge variant="outline" className="text-xs">Push</Badge>
                          )}
                          {connector.capabilities?.realtime && (
                            <Badge variant="outline" className="text-xs">Realtime</Badge>
                          )}
                        </div>

                        {/* Países soportados */}
                        {connector.supported_countries.length > 0 && (
                          <p className="text-xs text-gray-500">
                            Países: {connector.supported_countries.slice(0, 5).join(', ')}
                            {connector.supported_countries.length > 5 && '...'}
                          </p>
                        )}
                      </div>
                      
                      {isSelected ? (
                        <Check className="h-5 w-5 text-blue-600 shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Info del proveedor seleccionado */}
      {selectedProvider && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                {selectedProvider.logo_url ? (
                  <img src={selectedProvider.logo_url} alt="" className="w-12 h-12 object-contain" />
                ) : (
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800 rounded flex items-center justify-center">
                    <Globe className="h-6 w-6 text-blue-600" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">
                  Proveedor seleccionado: {selectedProvider.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tipo de autenticación: <strong>{selectedProvider.auth_type}</strong>
                </p>
                {selectedProvider.docs_url && (
                  <a
                    href={selectedProvider.docs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Ver documentación →
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
