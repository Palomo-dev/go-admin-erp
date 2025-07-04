'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CurrencyTemplate {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active: boolean;
}

interface CurrencySelectorProps {
  organizationId: number;
  onComplete: () => void;
}

export default function CurrencySelector({ organizationId, onComplete }: CurrencySelectorProps) {
  const [templates, setTemplates] = useState<CurrencyTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<CurrencyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Función para cargar plantillas
  async function loadTemplates() {
    try {
      setLoading(true);
      setError(null);
      setTemplates([]);
      setFilteredTemplates([]);

      // Obtener plantillas de monedas usando RPC para evitar restricciones de RLS
      const { data: allTemplates, error: templateError } = await supabase
        .rpc('get_currency_templates');

      if (templateError) {
        console.error('Error al llamar a get_currency_templates:', templateError);
        throw templateError;
      }
      
      if (!allTemplates || allTemplates.length === 0) {
        setError('No se encontraron plantillas de monedas en el sistema');
        return;
      }
      
      console.log('Total plantillas en el sistema:', allTemplates.length);

      // Obtener monedas ya añadidas a esta organización
      const { data: existingCurrencies, error: existingError } = await supabase
        .from('currencies')
        .select('code')
        .eq('organization_id', organizationId);

      if (existingError) throw existingError;
      
      // Crear conjunto de códigos existentes
      const existingCodes = new Set<string>();
      if (existingCurrencies && existingCurrencies.length > 0) {
        existingCurrencies.forEach(c => {
          if (c.code) existingCodes.add(c.code);
        });
        console.log('Monedas ya existentes en organización:', Array.from(existingCodes));
      } else {
        console.log('No hay monedas existentes en esta organización');
      }

      // Filtrar plantillas que no están añadidas
      const availableTemplates = allTemplates.filter((template: CurrencyTemplate) => 
        !existingCodes.has(template.code)
      );
      
      console.log('Plantillas disponibles para añadir:', availableTemplates.length);

      if (availableTemplates.length === 0) {
        setError('Ya se han añadido todas las plantillas de monedas disponibles');
      } else {
        setTemplates(availableTemplates);
        setFilteredTemplates(availableTemplates);
      }
    } catch (err: any) {
      console.error('Error al cargar plantillas de monedas:', err);
      setError('Error al cargar plantillas: ' + err.message);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las plantillas de monedas: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }
  
  // Cargar las plantillas de monedas
  useEffect(() => {
    if (organizationId) {
      loadTemplates();
    }
  }, [organizationId]);

  // Filtrar plantillas según búsqueda
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredTemplates(templates);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = templates.filter(
        template => 
          template.code.toLowerCase().includes(query) || 
          template.name.toLowerCase().includes(query)
      );
      setFilteredTemplates(filtered);
    }
  }, [searchQuery, templates]);

  // Añadir moneda seleccionada a la organización
  async function addCurrency() {
    if (!selectedCurrency) {
      toast({
        title: 'Seleccione una moneda',
        description: 'Debe seleccionar una moneda para añadir.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setAdding(true);
      
      const templateToAdd = templates.find(t => t.code === selectedCurrency);
      if (!templateToAdd) {
        throw new Error('No se encontró la plantilla seleccionada');
      }

      // Verificar si ya existe esta moneda en la organización
      const { data: existCheck, error: existError } = await supabase
        .from('currencies')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('code', templateToAdd.code);

      if (existError) throw existError;
      
      if (existCheck && existCheck.length > 0) {
        throw new Error('Esta moneda ya existe en su organización');
      }

      // Añadir moneda a la organización
      const { error } = await supabase
        .from('currencies')
        .insert({
          code: templateToAdd.code,
          name: templateToAdd.name,
          symbol: templateToAdd.symbol,
          decimals: templateToAdd.decimals,
          organization_id: organizationId,
          template_code: templateToAdd.code,
          is_base: false, // Por defecto no es base
          auto_update: true // Activar actualización automática por defecto
        });

      if (error) throw error;

      toast({
        title: 'Moneda añadida',
        description: `La moneda ${templateToAdd.code} ha sido añadida correctamente.`,
        variant: 'default',
      });

      onComplete();
    } catch (err: any) {
      console.error('Error al añadir moneda:', err);
      toast({
        title: 'Error',
        description: 'No se pudo añadir la moneda: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive" className="dark:bg-red-900 dark:text-white border-red-500">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-auto" 
            onClick={loadTemplates}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar
          </Button>
        </Alert>
      )}
      
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <Input
          placeholder="Buscar moneda por código o nombre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="dark:bg-gray-800 dark:border-gray-700"
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="currency-select" className="dark:text-gray-300">
            Seleccione una moneda
          </Label>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={loadTemplates} 
            disabled={loading}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
        
        <Select value={selectedCurrency || ''} onValueChange={setSelectedCurrency}>
          <SelectTrigger className="w-full dark:bg-gray-800 dark:border-gray-700">
            <SelectValue placeholder="Seleccionar moneda" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800">
            {loading ? (
              <div className="text-center p-4 dark:text-gray-300">
                <Loader2 className="animate-spin h-4 w-4 mx-auto mb-2" />
                Cargando monedas...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center p-4 dark:text-gray-300">
                {searchQuery ? 'No se encontraron monedas con esa búsqueda.' : 
                 'No hay plantillas de moneda disponibles para añadir.'}
              </div>
            ) : (
              <SelectGroup>
                <SelectLabel className="dark:text-gray-300">Monedas disponibles ({filteredTemplates.length})</SelectLabel>
                {filteredTemplates.map((template) => (
                  <SelectItem 
                    key={template.code} 
                    value={template.code}
                    className="dark:text-gray-200 dark:focus:bg-gray-700"
                  >
                    {template.code} - {template.name} ({template.symbol})
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          onClick={onComplete}
          className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Cancelar
        </Button>
        <Button
          onClick={addCurrency}
          disabled={!selectedCurrency || adding || loading}
          className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
        >
          {adding ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Añadiendo...
            </>
          ) : (
            'Añadir Moneda'
          )}
        </Button>
      </div>
    </div>
  );
}
