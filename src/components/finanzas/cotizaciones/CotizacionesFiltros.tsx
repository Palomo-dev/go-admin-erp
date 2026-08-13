'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, X } from 'lucide-react';
import type { QuotationFilters } from '@/lib/services/cotizacionesService';

interface CotizacionesFiltrosProps {
  onFiltrosChange?: (filtros: QuotationFilters) => void;
}

export function CotizacionesFiltros({ onFiltrosChange }: CotizacionesFiltrosProps = {}) {
  const [busqueda, setBusqueda] = useState('');
  const [status, setStatus] = useState<string>('todos');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  const handleBuscar = () => {
    onFiltrosChange?.({
      busqueda,
      status: status as QuotationFilters['status'],
    });
  };

  const limpiarFiltros = () => {
    setBusqueda('');
    setStatus('todos');
    onFiltrosChange?.({ busqueda: '', status: 'todos' });
  };

  const tieneFiltrosActivos = busqueda || status !== 'todos';

  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por número o cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
            className="pl-9 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="accepted">Aceptada</SelectItem>
            <SelectItem value="rejected">Rechazada</SelectItem>
            <SelectItem value="expired">Vencida</SelectItem>
            <SelectItem value="converted">Convertida</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleBuscar} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Filter className="h-4 w-4 mr-2" />
          Filtrar
        </Button>
        {tieneFiltrosActivos && (
          <Button variant="outline" onClick={limpiarFiltros}>
            <X className="h-4 w-4 mr-2" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
