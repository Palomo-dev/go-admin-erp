'use client';

import { useState, useEffect } from 'react';
import { 
  BuildingOfficeIcon, 
  UsersIcon, 
  CubeIcon,
  CalculatorIcon,
  CheckIcon,
  BoltIcon
} from '@heroicons/react/24/outline';
import { getEnterprisePricing, EnterprisePricing, calculateEnterprisePrice, generatePriceBreakdown } from '@/lib/services/pricingService';

export interface EnterpriseConfig {
  modulesCount: number;
  branchesCount: number;
  usersCount: number;
  aiCredits: number;  // Cantidad de créditos que quiere comprar
  selectedModules: string[];
}

interface EnterpriseConfigSelectorProps {
  config: EnterpriseConfig;
  onChange: (config: EnterpriseConfig) => void;
  billingPeriod?: 'monthly' | 'yearly'; // Para calcular precio anual con descuento
}

interface Module {
  code: string;
  name: string;
  icon: string;
  isCore: boolean;
}

const CORE_MODULES = ['branches', 'branding', 'clientes', 'organizations', 'roles', 'subscriptions'];

export default function EnterpriseConfigSelector({ 
  config, 
  onChange,
  billingPeriod = 'monthly'
}: EnterpriseConfigSelectorProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<EnterprisePricing | null>(null);

  useEffect(() => {
    loadModules();
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      const pricingData = await getEnterprisePricing();
      setPricing(pricingData);
    } catch (error) {
      console.error('Error loading pricing:', error);
    }
  };

  const loadModules = async () => {
    try {
      const response = await fetch('/api/modules/public');
      if (!response.ok) {
        throw new Error('Error fetching modules');
      }
      const data = await response.json();
      setModules(data.modules || []);
    } catch (error) {
      console.error('Error loading modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = () => {
    if (!pricing) return 0;
    const monthlyBase = calculateEnterprisePrice(config, pricing, CORE_MODULES.length);
    const monthlyAICredits = (config.aiCredits || 0) * (pricing.aiCreditUnitPrice / 100);
    const monthlyTotal = monthlyBase + monthlyAICredits;
    
    // Aplicar descuento anual: 2 meses gratis (precio mensual × 10)
    if (billingPeriod === 'yearly') {
      return Math.round(monthlyTotal * 10);
    }
    return monthlyTotal;
  };

  const getPriceBreakdown = () => {
    if (!pricing) return null;
    const baseBreakdown = generatePriceBreakdown(config, pricing, CORE_MODULES.length);
    const aiCreditsMonthly = (config.aiCredits || 0) * (pricing.aiCreditUnitPrice / 100);
    const monthlyTotal = baseBreakdown.total + aiCreditsMonthly;
    
    // Calcular totales según período
    const isYearly = billingPeriod === 'yearly';
    const periodMultiplier = isYearly ? 10 : 1;
    const periodTotal = Math.round(monthlyTotal * periodMultiplier);
    
    return {
      ...baseBreakdown,
      monthlyTotal,
      aiCredits: aiCreditsMonthly,
      periodTotal,
      isYearly,
      aiCreditUnitPrice: pricing.aiCreditUnitPrice,
    };
  };

  const handleModuleToggle = (moduleCode: string) => {
    if (CORE_MODULES.includes(moduleCode)) return; // No se pueden desactivar los core

    const newSelectedModules = config.selectedModules.includes(moduleCode)
      ? config.selectedModules.filter(m => m !== moduleCode)
      : [...config.selectedModules, moduleCode];
    
    onChange({
      ...config,
      selectedModules: newSelectedModules,
      modulesCount: CORE_MODULES.length + newSelectedModules.length,
    });
  };

  const additionalModules = modules.filter(m => !m.isCore);
  const estimatedPrice = calculatePrice();
  const priceBreakdown = getPriceBreakdown();

  if (loading || !pricing) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-600">Cargando configuración...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen del plan */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-center gap-2 mb-3">
          <CalculatorIcon className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-blue-900">Configuración Enterprise</h3>
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{config.modulesCount}</div>
            <div className="text-gray-600">Módulos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{config.branchesCount}</div>
            <div className="text-gray-600">Sucursales</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{config.usersCount}</div>
            <div className="text-gray-600">Usuarios</div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-blue-200">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Precio estimado:</span>
            <span className="text-xl font-bold text-blue-700">
              ${estimatedPrice.toFixed(2)}/{billingPeriod === 'yearly' ? 'año' : 'mes'}
              {billingPeriod === 'yearly' && priceBreakdown && (
                <span className="text-sm font-normal text-green-600 ml-2">
                  (ahorras 2 meses)
                </span>
              )}
            </span>
          </div>
          {priceBreakdown && (
            <div className="text-xs text-gray-500 mt-1 space-y-0.5">
              <p>
                Base ${priceBreakdown.base} + {priceBreakdown.details.additionalModules} módulos (${priceBreakdown.details.moduleUnitPrice}c/u) + {config.branchesCount} sucursales (${priceBreakdown.details.branchUnitPrice}c/u) + {config.usersCount} usuarios (${priceBreakdown.details.userUnitPrice}c/u)
                {billingPeriod === 'yearly' && (
                  <span className="text-green-600"> × 10 (descuento anual)</span>
                )}
              </p>
              {config.aiCredits > 0 && (
                <p>+ {config.aiCredits.toLocaleString()} créditos IA (${(priceBreakdown.aiCreditUnitPrice / 100).toFixed(2)}/crédito) = ${priceBreakdown.aiCredits?.toFixed(2)}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Configuración de Sucursales y Usuarios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <BuildingOfficeIcon className="w-4 h-4" />
            Sucursales
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={config.branchesCount}
            onChange={(e) => onChange({ ...config, branchesCount: parseInt(e.target.value) || 1 })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">${pricing.branchUnitPrice} por sucursal/mes</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <UsersIcon className="w-4 h-4" />
            Usuarios
          </label>
          <input
            type="number"
            min={1}
            max={200}
            value={config.usersCount}
            onChange={(e) => onChange({ ...config, usersCount: parseInt(e.target.value) || 1 })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">${pricing.userUnitPrice} por usuario/mes</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <BoltIcon className="w-4 h-4" />
            Créditos IA
          </label>
          <input
            type="number"
            min={0}
            step={1000}
            value={config.aiCredits || 0}
            onChange={(e) => onChange({ ...config, aiCredits: parseInt(e.target.value) || 0 })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            placeholder="Ej: 10000"
          />
          <p className="text-xs text-gray-500 mt-1">${(pricing.aiCreditUnitPrice / 100).toFixed(2)} por crédito</p>
        </div>
      </div>

      {/* Módulos Core (siempre incluidos) */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <CheckIcon className="w-4 h-4 text-green-500" />
          Módulos Core (Incluidos)
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {modules.filter(m => m.isCore).map((module) => (
            <div
              key={module.code}
              className="flex items-center gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-sm"
            >
              <CheckIcon className="w-4 h-4 text-green-600" />
              <span className="text-gray-700">{module.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Módulos Adicionales (seleccionables) */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <CubeIcon className="w-4 h-4 text-blue-500" />
          Módulos Adicionales (Máx. 15)
          <span className="text-xs text-gray-500 font-normal">
            ({config.selectedModules.length}/15 seleccionados)
          </span>
        </h4>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {additionalModules.map((module) => {
            const isSelected = config.selectedModules.includes(module.code);
            const canSelect = config.selectedModules.length < 15 || isSelected;
            
            return (
              <button
                key={module.code}
                type="button"
                onClick={() => canSelect && handleModuleToggle(module.code)}
                disabled={!canSelect}
                className={`flex items-center gap-2 p-2 rounded-md text-sm text-left transition-all ${
                  isSelected
                    ? 'bg-blue-100 border-blue-300 border'
                    : canSelect
                    ? 'bg-gray-50 border-gray-200 border hover:bg-gray-100'
                    : 'bg-gray-100 border-gray-200 border opacity-50 cursor-not-allowed'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                  isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                }`}>
                  {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                </div>
                <span className="text-gray-700">{module.name}</span>
              </button>
            );
          })}
        </div>
        
        <p className="text-xs text-gray-500 mt-2">
          ${pricing.moduleUnitPrice} por módulo adicional/mes (después de los 6 core)
        </p>
      </div>

      {/* Nota */}
      <div className="bg-yellow-50 rounded-md p-3 text-xs text-yellow-700">
        <strong>Nota:</strong> El precio final se calculará y confirmará antes de completar la suscripción. 
        La configuración puede ajustarse después desde el panel de administración.
      </div>
    </div>
  );
}

export { CORE_MODULES };
