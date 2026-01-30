'use client';

import { useState } from 'react';
import type { OrganizationCurrency } from '@/lib/services/hrmConfigService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DollarSign, Plus, Star, Trash2, Loader2 } from 'lucide-react';

interface CurrenciesCardProps {
  currencies: OrganizationCurrency[];
  availableCurrencies: { code: string; name: string; symbol: string }[];
  onSetBase: (currencyCode: string) => Promise<void>;
  onAdd: (currencyCode: string) => Promise<void>;
  onRemove: (currencyCode: string) => Promise<void>;
  isLoading?: boolean;
}

export function CurrenciesCard({
  currencies,
  availableCurrencies,
  onSetBase,
  onAdd,
  onRemove,
  isLoading,
}: CurrenciesCardProps) {
  const [newCurrency, setNewCurrency] = useState('');
  const [adding, setAdding] = useState(false);
  const [settingBase, setSettingBase] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const existingCodes = currencies.map(c => c.currency_code);
  const availableToAdd = availableCurrencies.filter(c => !existingCodes.includes(c.code));

  const handleAdd = async () => {
    if (!newCurrency) return;
    setAdding(true);
    try {
      await onAdd(newCurrency);
      setNewCurrency('');
    } finally {
      setAdding(false);
    }
  };

  const handleSetBase = async (code: string) => {
    setSettingBase(code);
    try {
      await onSetBase(code);
    } finally {
      setSettingBase(null);
    }
  };

  const handleRemove = async (code: string) => {
    setRemoving(code);
    try {
      await onRemove(code);
    } finally {
      setRemoving(null);
    }
  };

  const getCurrencyInfo = (code: string) => {
    return availableCurrencies.find(c => c.code === code) || { code, name: code, symbol: '$' };
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
          <DollarSign className="h-5 w-5 text-blue-600" />
          Monedas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Currency List */}
        <div className="space-y-2">
          {currencies.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No hay monedas configuradas
            </p>
          ) : (
            currencies.map((currency) => {
              const info = getCurrencyInfo(currency.currency_code);
              return (
                <div
                  key={currency.currency_code}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-bold">
                      {info.symbol}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {currency.currency_code}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {info.name}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {currency.is_base ? (
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        <Star className="mr-1 h-3 w-3" />
                        Base
                      </Badge>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetBase(currency.currency_code)}
                          disabled={settingBase === currency.currency_code}
                        >
                          {settingBase === currency.currency_code ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Star className="mr-1 h-3 w-3" />
                              Base
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemove(currency.currency_code)}
                          disabled={removing === currency.currency_code}
                          className="text-red-600 hover:text-red-700"
                        >
                          {removing === currency.currency_code ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Add Currency */}
        {availableToAdd.length > 0 && (
          <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Select value={newCurrency} onValueChange={setNewCurrency}>
              <SelectTrigger className="flex-1 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                <SelectValue placeholder="Agregar moneda..." />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                {availableToAdd.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.code} - {currency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAdd}
              disabled={!newCurrency || adding}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
