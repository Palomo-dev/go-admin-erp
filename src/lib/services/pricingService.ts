import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Cache para Enterprise pricing
let enterpriseCache: EnterprisePricing | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60000; // 1 minuto

// Interface para precios de Enterprise (desde pricing_config)
export interface EnterprisePricing {
  basePrice: number;
  moduleUnitPrice: number;
  branchUnitPrice: number;
  userUnitPrice: number;
  aiCreditUnitPrice: number;  // Precio por cada crédito de IA
  currency: string;
}

/**
 * Obtiene los precios unitarios de Enterprise desde la API
 * ESTA es la única función que lee de pricing_config
 */
export async function getEnterprisePricing(): Promise<EnterprisePricing> {
  const now = Date.now();
  if (enterpriseCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return enterpriseCache;
  }

  try {
    // Determinar la URL base
    const baseUrl = typeof window !== 'undefined' 
      ? '' // Client-side: URL relativa
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'); // Server-side: URL absoluta
    
    const response = await fetch(`${baseUrl}/api/pricing/enterprise`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch pricing');
    }
    
    const pricing = await response.json();
    
    // Guardar en cache
    enterpriseCache = pricing;
    cacheTimestamp = now;

    return pricing;
  } catch (error) {
    console.error('Error fetching enterprise pricing:', error);
    // Valores por defecto
    return {
      basePrice: 199,
      moduleUnitPrice: 49,
      branchUnitPrice: 59,
      userUnitPrice: 19,
      aiCreditUnitPrice: 1,
      currency: 'usd',
    };
  }
}

/**
 * Calcula el precio total de Enterprise basado en la configuración
 */
export function calculateEnterprisePrice(
  config: {
    modulesCount: number;
    branchesCount: number;
    usersCount: number;
  },
  pricing: EnterprisePricing,
  coreModulesCount: number = 6
): number {
  const additionalModules = Math.max(0, config.modulesCount - coreModulesCount);
  
  const modulesPrice = additionalModules * pricing.moduleUnitPrice;
  const branchesPrice = config.branchesCount * pricing.branchUnitPrice;
  const usersPrice = config.usersCount * pricing.userUnitPrice;
  
  return pricing.basePrice + modulesPrice + branchesPrice + usersPrice;
}

/**
 * Genera el desglose de la cotización para mostrar al usuario
 */
export function generatePriceBreakdown(
  config: {
    modulesCount: number;
    branchesCount: number;
    usersCount: number;
  },
  pricing: EnterprisePricing,
  coreModulesCount: number = 6
): {
  base: number;
  modules: number;
  branches: number;
  users: number;
  total: number;
  details: {
    additionalModules: number;
    moduleUnitPrice: number;
    branchUnitPrice: number;
    userUnitPrice: number;
  };
} {
  const additionalModules = Math.max(0, config.modulesCount - coreModulesCount);
  
  const modulesPrice = additionalModules * pricing.moduleUnitPrice;
  const branchesPrice = config.branchesCount * pricing.branchUnitPrice;
  const usersPrice = config.usersCount * pricing.userUnitPrice;
  const total = pricing.basePrice + modulesPrice + branchesPrice + usersPrice;

  return {
    base: pricing.basePrice,
    modules: modulesPrice,
    branches: branchesPrice,
    users: usersPrice,
    total,
    details: {
      additionalModules,
      moduleUnitPrice: pricing.moduleUnitPrice,
      branchUnitPrice: pricing.branchUnitPrice,
      userUnitPrice: pricing.userUnitPrice,
    },
  };
}
