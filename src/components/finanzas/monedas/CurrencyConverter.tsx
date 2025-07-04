'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRightLeft, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Currency {
  code: string;
  name: string;
  symbol?: string;
}

interface CurrencyConverterProps {
  rates: any[];
  currencies: Currency[];
  date: Date;
}

export default function CurrencyConverter({ rates, currencies, date }: CurrencyConverterProps) {
  const [fromCurrency, setFromCurrency] = useState<string>('USD');
  const [toCurrency, setToCurrency] = useState<string>('COP');
  const [amount, setAmount] = useState<number>(1000);
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [previousRate, setPreviousRate] = useState<number | null>(null);
  const [rateDiff, setRateDiff] = useState<number | null>(null);

  // Convertir el monto cuando cambia alguno de los parámetros
  useEffect(() => {
    convertAmount();
    
    // Cargar tasa del día anterior
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    loadPreviousRate(yesterday);
  }, [fromCurrency, toCurrency, amount, rates]);

  // Cargar la tasa del día anterior para comparación
  const loadPreviousRate = async (previousDate: Date) => {
    try {
      const { supabase } = await import('@/lib/supabase/config');
      const formattedDate = previousDate.toISOString().split('T')[0];
      
      // Buscar tasas de ambas monedas del día anterior
      const { data } = await supabase
        .from('currency_rates')
        .select('code, rate')
        .eq('rate_date', formattedDate)
        .in('code', [fromCurrency, toCurrency]);
      
      if (data && data.length > 0) {
        const fromRate = data.find(r => r.code === fromCurrency)?.rate || 1;
        const toRate = data.find(r => r.code === toCurrency)?.rate || 1;
        
        // Calcular tasa entre las dos monedas
        const prevRate = toRate / fromRate;
        setPreviousRate(prevRate);
        
        // Calcular la diferencia con la tasa actual
        const currentFromRate = rates.find(r => r.code === fromCurrency)?.rate || 1;
        const currentToRate = rates.find(r => r.code === toCurrency)?.rate || 1;
        const currentRate = currentToRate / currentFromRate;
        
        // Porcentaje de cambio
        if (prevRate > 0) {
          const change = ((currentRate - prevRate) / prevRate) * 100;
          setRateDiff(change);
        }
      }
    } catch (error) {
      console.error('Error al cargar tasa anterior:', error);
    }
  };

  const convertAmount = () => {
    if (!rates || rates.length === 0 || !amount) {
      setConvertedAmount(null);
      return;
    }

    // Encontrar tasas para las monedas seleccionadas
    const fromRate = rates.find(r => r.code === fromCurrency)?.rate || 1;
    const toRate = rates.find(r => r.code === toCurrency)?.rate || 1;

    // Convertir montos usando USD como base intermedia
    // Fórmula: (amount / fromRate) * toRate
    const result = (amount / fromRate) * toRate;
    setConvertedAmount(result);
  };

  // Intercambiar monedas
  const swapCurrencies = () => {
    const temp = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(temp);
  };

  // Encontrar símbolo para una moneda
  const getCurrencySymbol = (code: string) => {
    const currency = currencies.find(c => c.code === code);
    return currency?.symbol || code;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Conversor de Monedas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2">
            <div className="flex-1">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value))}
                className="text-right"
              />
            </div>
            <Select value={fromCurrency} onValueChange={setFromCurrency}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Moneda" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency, index) => (
                  <SelectItem key={`${currency.code}-${index}`} value={currency.code}>
                    {currency.symbol} {currency.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="icon" onClick={swapCurrencies} className="mx-1 w-10">
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
            
            <Select value={toCurrency} onValueChange={setToCurrency}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Moneda" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency, index) => (
                  <SelectItem key={`${currency.code}-${index}`} value={currency.code}>
                    {currency.symbol} {currency.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="mt-4 text-center">
            <div className="text-2xl font-bold">
              {convertedAmount !== null ? (
                <>
                  {getCurrencySymbol(toCurrency)}{' '}
                  {convertedAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </>
              ) : (
                '---'
              )}
            </div>
            {rateDiff !== null && (
              <div className="mt-2 flex items-center justify-center">
                <Badge 
                  variant={rateDiff >= 0 ? 'default' : 'destructive'}
                  className={`${rateDiff >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                >
                  {rateDiff >= 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {Math.abs(rateDiff).toFixed(2)}% respecto a ayer
                </Badge>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
