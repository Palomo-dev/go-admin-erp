'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { 
  CreditCard,
  ShoppingBag,
  MessageSquare,
  Share2,
  Megaphone,
  Hotel,
  Search,
  Truck,
  Link2,
  Zap,
  Filter,
  AlertCircle,
  CheckCircle2,
  Pause,
  XCircle,
  Server,
  Globe,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IntegrationConnection, IntegrationConnector, IntegrationProvider } from '@/lib/services/integrationsService';
import { ProviderCard } from './ProviderCard';

interface ProviderConfig {
  code: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  logoUrl?: string;
  color: string;
  bgColor: string;
  borderColor: string;
  category: string;
}

const PROVIDER_CONFIGS: Record<string, Omit<ProviderConfig, 'code' | 'name'>> = {
  stripe: {
    description: 'Pagos online con tarjeta',
    icon: <CreditCard className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
    color: 'text-[#635BFF]',
    bgColor: 'bg-[#635BFF]/10',
    borderColor: 'border-[#635BFF]/30',
    category: 'payments'
  },
  mercadopago: {
    description: 'Pagos en Latinoamérica',
    icon: <CreditCard className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg',
    color: 'text-[#00B1EA]',
    bgColor: 'bg-[#00B1EA]/10',
    borderColor: 'border-[#00B1EA]/30',
    category: 'payments'
  },
  paypal: {
    description: 'Pagos internacionales',
    icon: <CreditCard className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg',
    color: 'text-[#003087]',
    bgColor: 'bg-[#003087]/10',
    borderColor: 'border-[#003087]/30',
    category: 'payments'
  },
  payu: {
    description: 'Pasarela de pagos regional',
    icon: <CreditCard className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/PayU_logo.svg/1200px-PayU_logo.svg.png',
    color: 'text-[#A6C307]',
    bgColor: 'bg-[#A6C307]/10',
    borderColor: 'border-[#A6C307]/30',
    category: 'payments'
  },
  wompi: {
    description: 'Pagos en Colombia',
    icon: <CreditCard className="h-6 w-6" />,
    logoUrl: 'https://wompi.com/assets/images/logo-wompi-all-green.svg',
    color: 'text-[#34C759]',
    bgColor: 'bg-[#34C759]/10',
    borderColor: 'border-[#34C759]/30',
    category: 'payments'
  },
  rappi: {
    description: 'Delivery y pedidos online',
    icon: <ShoppingBag className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Rappi_logo.png',
    color: 'text-[#FF441F]',
    bgColor: 'bg-[#FF441F]/10',
    borderColor: 'border-[#FF441F]/30',
    category: 'delivery'
  },
  ifood: {
    description: 'Delivery de comida',
    icon: <ShoppingBag className="h-6 w-6" />,
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/ifood-1.svg',
    color: 'text-[#EA1D2C]',
    bgColor: 'bg-[#EA1D2C]/10',
    borderColor: 'border-[#EA1D2C]/30',
    category: 'delivery'
  },
  ubereats: {
    description: 'Uber Eats delivery',
    icon: <ShoppingBag className="h-6 w-6" />,
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/uber-eats-1.svg',
    color: 'text-[#06C167]',
    bgColor: 'bg-[#06C167]/10',
    borderColor: 'border-[#06C167]/30',
    category: 'delivery'
  },
  whatsapp: {
    description: 'WhatsApp Business API',
    icon: <MessageSquare className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
    color: 'text-[#25D366]',
    bgColor: 'bg-[#25D366]/10',
    borderColor: 'border-[#25D366]/30',
    category: 'messaging'
  },
  twilio: {
    description: 'SMS, voz y WhatsApp',
    icon: <MessageSquare className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Twilio-logo-red.svg',
    color: 'text-[#F22F46]',
    bgColor: 'bg-[#F22F46]/10',
    borderColor: 'border-[#F22F46]/30',
    category: 'messaging'
  },
  sendgrid: {
    description: 'Email transaccional',
    icon: <MessageSquare className="h-6 w-6" />,
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/sendgrid-1.svg',
    color: 'text-[#1A82E2]',
    bgColor: 'bg-[#1A82E2]/10',
    borderColor: 'border-[#1A82E2]/30',
    category: 'messaging'
  },
  meta: {
    description: 'Facebook & Instagram',
    icon: <Share2 className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg',
    color: 'text-[#0081FB]',
    bgColor: 'bg-[#0081FB]/10',
    borderColor: 'border-[#0081FB]/30',
    category: 'social'
  },
  tiktok: {
    description: 'TikTok Business',
    icon: <Share2 className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg',
    color: 'text-[#000000] dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
    borderColor: 'border-black/20 dark:border-white/20',
    category: 'social'
  },
  google_ads: {
    description: 'Google Ads campaigns',
    icon: <Megaphone className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Google_Ads_logo.svg',
    color: 'text-[#4285F4]',
    bgColor: 'bg-[#4285F4]/10',
    borderColor: 'border-[#4285F4]/30',
    category: 'ads'
  },
  booking: {
    description: 'Booking.com channel',
    icon: <Hotel className="h-6 w-6" />,
    logoUrl: 'https://cdn.worldvectorlogo.com/logos/bookingcom-1.svg',
    color: 'text-[#003580]',
    bgColor: 'bg-[#003580]/10',
    borderColor: 'border-[#003580]/30',
    category: 'ota'
  },
  airbnb: {
    description: 'Airbnb channel manager',
    icon: <Hotel className="h-6 w-6" />,
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Airbnb_Logo_B%C3%A9lo.svg',
    color: 'text-[#FF5A5F]',
    bgColor: 'bg-[#FF5A5F]/10',
    borderColor: 'border-[#FF5A5F]/30',
    category: 'ota'
  },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  payments: {
    label: 'Pagos',
    icon: <CreditCard className="h-4 w-4" />,
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  delivery: {
    label: 'Delivery',
    icon: <Truck className="h-4 w-4" />,
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  messaging: {
    label: 'Mensajería',
    icon: <MessageSquare className="h-4 w-4" />,
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  social: {
    label: 'Social',
    icon: <Share2 className="h-4 w-4" />,
    color: 'text-pink-700 dark:text-pink-400',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',
  },
  ads: {
    label: 'Publicidad',
    icon: <Megaphone className="h-4 w-4" />,
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  ota: {
    label: 'OTA / Reservas',
    icon: <Hotel className="h-4 w-4" />,
    color: 'text-purple-700 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
};

// Mapeo ISO3 → ISO2 para los 10 países soportados
const ISO3_TO_ISO2: Record<string, string> = {
  COL: 'CO', MEX: 'MX', ARG: 'AR', BRA: 'BR', CHL: 'CL',
  PER: 'PE', URY: 'UY', ECU: 'EC', PAN: 'PA', CRI: 'CR',
  USA: 'US', ESP: 'ES', GTM: 'GT', HND: 'HN', SLV: 'SV',
  DOM: 'DO', BOL: 'BO', PRY: 'PY', NIC: 'NI', VEN: 'VE',
};

interface AvailableProvidersProps {
  providers: IntegrationProvider[];
  connectors: IntegrationConnector[];
  connections: IntegrationConnection[];
  branches: Array<{ id: number; name: string }>;
  organizationCountryCode?: string;
  onConnect: (provider: IntegrationProvider) => void;
  onConfigure: (connection: IntegrationConnection) => void;
  onToggleStatus: (connection: IntegrationConnection) => void;
  onRevoke: (connection: IntegrationConnection) => void;
  onHealthCheck: (connection: IntegrationConnection) => void;
  onDuplicate: (connection: IntegrationConnection) => void;
  onDelete: (connection: IntegrationConnection) => void;
}

export function AvailableProviders({ 
  providers, 
  connectors,
  connections,
  branches,
  organizationCountryCode,
  onConnect,
  onConfigure,
  onToggleStatus,
  onRevoke,
  onHealthCheck,
  onDuplicate,
  onDelete
}: AvailableProvidersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [environmentFilter, setEnvironmentFilter] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState<'all' | 'my_country' | 'other'>('all');

  // Convertir ISO3 de la org a ISO2 para comparar con supported_countries
  const orgCountryIso2 = organizationCountryCode
    ? ISO3_TO_ISO2[organizationCountryCode.toUpperCase()] || organizationCountryCode
    : undefined;

  // Determinar si un proveedor tiene conectores disponibles en el país de la org
  const isProviderAvailableInCountry = useCallback((providerId: string): boolean => {
    if (!orgCountryIso2) return true;
    const providerConnectors = connectors.filter(c => c.provider_id === providerId);
    if (providerConnectors.length === 0) return true; // Sin conectores = global
    return providerConnectors.some(c =>
      c.supported_countries.length === 0 || c.supported_countries.includes(orgCountryIso2)
    );
  }, [connectors, orgCountryIso2]);

  // Obtener conexiones por proveedor - usando connector.provider.id
  const getProviderConnectionsFiltered = (providerId: string) => {
    return connections.filter(c => {
      const connector = c.connector;
      if (!connector) return false;
      
      // El provider puede venir como objeto anidado o como array (Supabase)
      const provider = connector.provider;
      let providerIdFromConnector: string | undefined;
      
      if (Array.isArray(provider)) {
        // Si es array, tomar el primer elemento
        providerIdFromConnector = provider[0]?.id;
      } else if (typeof provider === 'object' && provider !== null) {
        // Si es objeto, acceder directamente
        providerIdFromConnector = provider.id;
      } else {
        // Fallback a provider_id directo en connector
        providerIdFromConnector = connector.provider_id;
      }
      
      return providerIdFromConnector === providerId;
    });
  };

  const getConnectionStatus = (providerId: string) => {
    const providerConnections = getProviderConnectionsFiltered(providerId);
    if (providerConnections.length === 0) return 'not_connected';
    
    const hasConnected = providerConnections.some(c => c.status === 'connected');
    const hasError = providerConnections.some(c => c.status === 'error');
    
    if (hasError) return 'error';
    if (hasConnected) return 'connected';
    return 'pending';
  };

  const getConnectedCount = (providerId: string) => {
    return getProviderConnectionsFiltered(providerId).length;
  };

  const getConfig = (provider: IntegrationProvider) => {
    return PROVIDER_CONFIGS[provider.code] || {
      description: `Integración con ${provider.name}`,
      icon: <CreditCard className="h-6 w-6" />,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      borderColor: 'border-gray-200 dark:border-gray-700',
      category: provider.category || 'other'
    };
  };

  // Obtener categorías únicas
  const categories = useMemo(() => {
    return Array.from(new Set(providers.map(p => p.category)));
  }, [providers]);

  // Estadísticas
  const stats = useMemo(() => {
    const connected = connections.filter(c => c.status === 'connected').length;
    const paused = connections.filter(c => c.status === 'paused').length;
    const error = connections.filter(c => c.status === 'error').length;
    return { total: connections.length, connected, paused, error };
  }, [connections]);

  // Filtrar proveedores
  const filteredProviders = useMemo(() => {
    return providers.filter(provider => {
      const matchesSearch = provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        provider.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || provider.category === selectedCategory;

      // Filtro por país
      if (countryFilter !== 'all' && orgCountryIso2) {
        const available = isProviderAvailableInCountry(provider.id);
        if (countryFilter === 'my_country' && !available) return false;
        if (countryFilter === 'other' && available) return false;
      }
      
      // Si hay filtros de conexión, solo mostrar proveedores con conexiones que coincidan
      if (statusFilter || environmentFilter) {
        const providerConns = getProviderConnectionsFiltered(provider.id);
        if (providerConns.length === 0) return false;
        
        const hasMatchingConnection = providerConns.some(conn => {
          const matchesStatus = !statusFilter || conn.status === statusFilter;
          const matchesEnv = !environmentFilter || conn.environment === environmentFilter;
          return matchesStatus && matchesEnv;
        });
        if (!hasMatchingConnection) return false;
      }
      
      return matchesSearch && matchesCategory;
    });
  }, [providers, searchTerm, selectedCategory, statusFilter, environmentFilter, connections, countryFilter, orgCountryIso2, isProviderAvailableInCountry]);

  // Agrupar por categoría y ordenar (disponibles en tu país primero)
  const groupedProviders = useMemo(() => {
    const grouped = filteredProviders.reduce((acc, provider) => {
      const category = provider.category || 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(provider);
      return acc;
    }, {} as Record<string, IntegrationProvider[]>);

    // Ordenar dentro de cada categoría: disponibles primero
    if (orgCountryIso2) {
      for (const category of Object.keys(grouped)) {
        grouped[category].sort((a, b) => {
          const aAvail = isProviderAvailableInCountry(a.id) ? 0 : 1;
          const bAvail = isProviderAvailableInCountry(b.id) ? 0 : 1;
          return aAvail - bAvail;
        });
      }
    }

    return grouped;
  }, [filteredProviders, orgCountryIso2, isProviderAvailableInCountry]);

  // Limpiar filtros
  const clearFilters = () => {
    setStatusFilter(null);
    setEnvironmentFilter(null);
    setSearchTerm('');
    setSelectedCategory(null);
    setCountryFilter('all');
  };

  const hasActiveFilters = statusFilter || environmentFilter || searchTerm || selectedCategory || countryFilter !== 'all';

  return (
    <div className="p-4 space-y-6">
      {/* Estadísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.connected}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Activas</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Pause className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.paused}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pausadas</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.error}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Con Error</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar integración..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={selectedCategory === null ? 'default' : 'outline'}
            className="cursor-pointer px-3 py-1"
            onClick={() => setSelectedCategory(null)}
          >
            Todos
          </Badge>
          {categories.map((category) => {
            const config = CATEGORY_CONFIG[category];
            const isSelected = selectedCategory === category;
            return (
              <Badge
                key={category}
                variant={isSelected ? 'default' : 'outline'}
                className={`cursor-pointer px-3 py-1 gap-1 ${isSelected ? config?.bgColor + ' ' + config?.color : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {config?.icon}
                {config?.label || category}
              </Badge>
            );
          })}
        </div>

        </div>

        {/* Filtros: País, Estado, Ambiente */}
        <div className="flex gap-2 flex-wrap items-center">
          {/* Filtro por país */}
          <Select value={countryFilter} onValueChange={(v) => setCountryFilter(v as 'all' | 'my_country' | 'other')}>
            <SelectTrigger className="w-[180px] h-9">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-gray-400" />
                <SelectValue placeholder="País" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los países</SelectItem>
              <SelectItem value="my_country">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-green-500" />
                  <span>Mi país{orgCountryIso2 ? ` (${orgCountryIso2})` : ''}</span>
                </div>
              </SelectItem>
              <SelectItem value="other">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-amber-500" />
                  <span>Otros países</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro por estado */}
          {connections.length > 0 && (
            <>
              <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? null : v)}>
                <SelectTrigger className="w-[170px] h-9">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-gray-400" />
                    <SelectValue placeholder="Estado" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="connected">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span>Conectado</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="paused">
                    <div className="flex items-center gap-2">
                      <Pause className="h-3.5 w-3.5 text-yellow-500" />
                      <span>Pausado</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="error">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                      <span>Error</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={environmentFilter || 'all'} onValueChange={(v) => setEnvironmentFilter(v === 'all' ? null : v)}>
                <SelectTrigger className="w-[150px] h-9">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-gray-400" />
                    <SelectValue placeholder="Ambiente" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="production">Producción</SelectItem>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
              <XCircle className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Grid de proveedores */}
      {Object.entries(groupedProviders).map(([category, categoryProviders]) => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-1.5 rounded-md ${CATEGORY_CONFIG[category]?.bgColor || 'bg-gray-100'}`}>
              <span className={CATEGORY_CONFIG[category]?.color || 'text-gray-500'}>
                {CATEGORY_CONFIG[category]?.icon}
              </span>
            </div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              {CATEGORY_CONFIG[category]?.label || category}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryProviders.map((provider) => {
              const config = getConfig(provider);
              const providerConnections = getProviderConnectionsFiltered(provider.id);

              const availableInCountry = isProviderAvailableInCountry(provider.id);

              return (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  config={config}
                  connections={providerConnections}
                  branches={branches}
                  isAvailableInCountry={availableInCountry}
                  organizationCountryCode={orgCountryIso2}
                  onConnect={onConnect}
                  onConfigure={onConfigure}
                  onToggleStatus={onToggleStatus}
                  onRevoke={onRevoke}
                  onHealthCheck={onHealthCheck}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export { PROVIDER_CONFIGS, CATEGORY_CONFIG };
export default AvailableProviders;
