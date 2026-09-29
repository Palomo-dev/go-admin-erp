'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, X } from 'lucide-react';
import type { QuotationFilters } from '@/lib/services/cotizacionesService';
import { SearchInput } from '@/components/kit/SearchInput';

interface CotizacionesFiltrosProps {
  onFiltrosChange?: (filtros: QuotationFilters) => void;
}

export function CotizacionesFiltros({ onFiltrosChange }: CotizacionesFiltrosProps = {}) {
  const [busqueda, setBusqueda] = useState('');
  const [status, setStatus] = useState<string>('todos');

  const handleBuscar = (texto: string = busqueda) => {
    onFiltrosChange?.({
      busqueda: texto,
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
        {/* Enter busca ya; el debounce del kit también aplica la búsqueda al dejar de escribir. */}
        <SearchInput
          value={busqueda}
          onChange={handleBuscar}
          onValueChange={setBusqueda}
          placeholder="Buscar por número o cliente..."
          className="flex-1"
        />
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
        <Button onClick={() => handleBuscar()} className="bg-blue-600 hover:bg-blue-700 text-white">
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
