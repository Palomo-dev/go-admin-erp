'use client';

import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandInput, CommandList } from '@/components/ui/command';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDebounce } from '../../../lib/hooks/useDebounce';
import { getOrganizationId } from '../../../lib/hooks/useOrganization';

// Componentes modulares
import { SearchResultGroup } from './GlobalSearch/SearchResultGroup';
import { searchData } from './GlobalSearch/searchService';
import { SearchResult, SearchResultType, PAGINAS_PREDEFINIDAS, PAGINAS_INICIALES } from './GlobalSearch/types';

// Formas mínimas de las filas que devuelve `searchData` (lo que aquí se pinta).
interface FilaFactura { id: string; number?: string | null; total?: number | null; status?: string | null; customers?: { full_name?: string | null } | null }
interface FilaPedido { id: string; order_number?: string | null; customer_name?: string | null; total?: number | null; status?: string | null }
interface FilaReserva { id: string; checkin?: string | null; checkout?: string | null; status?: string | null; spaces?: { label?: string | null } | null; customers?: { full_name?: string | null } | null }
interface FilaEspacio { id: string; label?: string | null; floor_zone?: string | null; status?: string | null; space_types?: { name?: string | null } | null }
interface FilaMembresia { id: string; status?: string | null; start_date?: string | null; end_date?: string | null; membership_plans?: { name?: string | null } | null; customers?: { full_name?: string | null } | null }
interface FilaVehiculo { id: string; plate?: string | null; brand?: string | null; model?: string | null; color?: string | null; vehicle_type?: string | null }

/**
 * Componente de búsqueda global que permite buscar organizaciones, sucursales, 
 * usuarios, clientes, productos, etc.
 */
/** Evento con el que el shell abre el buscador desde cualquier disparador. */
export const ABRIR_BUSCADOR_EVENT = 'shell:abrir-buscador';

export interface PaginaBuscable {
  id: string;
  name: string;
  url: string;
  description?: string;
}

interface GlobalSearchProps {
  forceFullBar?: boolean;
  /**
   * Páginas que la persona puede abrir, sacadas del menú ya filtrado
   * (`filtrarNavegacion`). Sustituyen a las listas fijas de `types.ts`, que
   * ofrecían páginas de módulos inactivos y rutas que no existen.
   */
  paginas?: PaginaBuscable[];
  /** El disparador lo pinta el header nuevo (`SearchTrigger`). */
  sinDisparador?: boolean;
}

const GlobalSearch = ({ forceFullBar = false, paginas, sinDisparador = false }: GlobalSearchProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, query.trim().length <= 1 ? 400 : 200);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Función para abrir el diálogo de búsqueda
  const openSearchDialog = () => {
    setOpen(true);
    // Enfocar el input cuando se abre el diálogo
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const paginasRef = useRef<PaginaBuscable[] | undefined>(paginas);
  paginasRef.current = paginas;
  const paginasIniciales = (): SearchResult[] =>
    (paginasRef.current ? paginasRef.current.slice(0, 6) : PAGINAS_INICIALES).map((page) => ({
      ...page,
      type: 'page' as SearchResultType,
    }));
  const paginasTodas = (): SearchResult[] =>
    (paginasRef.current ?? PAGINAS_PREDEFINIDAS).map((page) => ({ ...page, type: 'page' as SearchResultType }));

  // Efecto para realizar la búsqueda cuando cambia el query debounceado
  useEffect(() => {
    // No realizar búsqueda si el query está vacío
    if (!debouncedQuery || debouncedQuery.trim().length < 1) {
      setResults(paginasIniciales());
      setIsLoading(false);
      return;
    }

    // Cancelar requests anteriores para liberar conexiones
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Watchdog: si por cualquier motivo la búsqueda no resuelve, forzar fin de carga
    const watchdog = setTimeout(() => {
      if (isMountedRef.current && !abortController.signal.aborted) {
        console.warn('[GlobalSearch] Watchdog: la búsqueda no completó a tiempo, forzando fin de carga.');
        setIsLoading(false);
      }
    }, 7000);

    const fetchData = async () => {
      setIsLoading(true);
      console.log('[GlobalSearch] Buscando:', debouncedQuery, '| organizationId:', getOrganizationId());

      try {
        // Usar el servicio modular para buscar datos
        const data = await searchData(debouncedQuery, 5, abortController.signal);
        console.log('[GlobalSearch] Resultado clientes:', data.clientes);

        // Solo actualizar si esta petición no fue cancelada por una búsqueda más reciente
        if (isMountedRef.current && !abortController.signal.aborted) {
          // Convertir los resultados de la API a formato de resultado de búsqueda
          // Usamos una declaración de tipo más explícita
          const searchResults = [
            // Primero mostrar páginas que coincidan con la búsqueda
            ...paginasTodas().filter(page =>
              page.name.toLowerCase().includes(debouncedQuery.toLowerCase())
            ),

            // Organizaciones
            ...(data.organizaciones || []).map(org => ({
              id: org.id,
              name: org.name,
              description: 'Organización',
              type: 'organization' as const,
              url: `/app/organizacion/${org.id}`
            })),

            // Sucursales
            ...(data.sucursales || []).map(branch => ({
              id: branch.id,
              name: branch.name,
              description: `Sucursal`,
              type: 'branch' as const,
              url: `/app/organizacion/sucursales/${branch.id}`
            })),

            // Clientes - Mejoramos la construcción del nombre y añadimos avatar_url
            ...(data.clientes || []).map(cliente => {
              // Usamos el nombre completo si está disponible, de lo contrario combinamos first_name y last_name
              const nombreCompleto = cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim();
              return {
                id: cliente.id,
                name: nombreCompleto || 'Cliente sin nombre',
                description: cliente.email || cliente.identification_number || 'Sin información adicional',
                type: 'customer' as const,
                url: `/app/clientes/${cliente.id}`,
                avatarUrl: cliente.avatar_url
              };
            }),

            // Productos
            ...(data.productos || []).map(producto => ({
              id: producto.id,
              name: producto.name,
              description: producto.sku || producto.description,
              type: 'product' as const,
              url: `/app/inventario/productos/${producto.id}`
            })),

            // Proveedores
            ...(data.proveedores || []).map(proveedor => ({
              id: proveedor.id,
              name: proveedor.name,
              description: proveedor.nit || proveedor.email,
              type: 'supplier' as const,
              url: `/app/proveedores/${proveedor.id}`
            })),

            // Categorías
            ...(data.categorias || []).map(categoria => ({
              id: categoria.id,
              name: categoria.name,
              description: categoria.slug,
              type: 'category' as const,
              url: `/app/inventario/categorias/${categoria.uuid}`
            })),

            // Facturas de venta
            ...(data.facturas || []).map((f: FilaFactura) => ({
              id: f.id,
              name: `Factura ${f.number || 'S/N'}`,
              description: `${f.customers?.full_name || ''} - $${Number(f.total || 0).toLocaleString()} - ${f.status || ''}`,
              type: 'invoice' as const,
              url: `/app/finanzas/facturas-venta/${f.id}`
            })),

            // Pedidos online
            ...(data.pedidosOnline || []).map((p: FilaPedido) => ({
              id: p.id,
              name: `Pedido ${p.order_number || ''}`,
              description: `${p.customer_name || ''} - $${Number(p.total || 0).toLocaleString()} - ${p.status || ''}`,
              type: 'web_order' as const,
              url: `/app/pos/pedidos-online/${p.id}`
            })),

            // Reservas
            ...(data.reservas || []).map((r: FilaReserva) => ({
              id: r.id,
              name: `Reserva ${r.spaces?.label || ''}`,
              description: `${r.customers?.full_name || ''} - ${r.checkin || ''} → ${r.checkout || ''} - ${r.status || ''}`,
              type: 'reservation' as const,
              url: `/app/pms/reservas/${r.id}`
            })),

            // Espacios
            ...(data.espacios || []).map((e: FilaEspacio) => ({
              id: e.id,
              name: e.label || 'Sin nombre',
              description: `${e.space_types?.name || ''} ${e.floor_zone ? '- ' + e.floor_zone : ''} - ${e.status || ''}`,
              type: 'space' as const,
              url: `/app/pms/espacios/${e.id}`
            })),

            // Membresías
            ...(data.membresias || []).map((m: FilaMembresia) => ({
              id: m.id,
              name: `${m.membership_plans?.name || 'Membresía'} - ${m.customers?.full_name || ''}`,
              description: `${m.status || ''} - ${formatPlainDate(m.start_date)} → ${formatPlainDate(m.end_date)}`,
              type: 'membership' as const,
              url: `/app/gym/membresias/${m.id}`
            })),

            // Vehículos de parqueadero
            ...(data.vehiculosParking || []).map((v: FilaVehiculo) => ({
              id: v.id,
              name: `${v.plate || 'Sin placa'}`,
              description: `${v.brand || ''} ${v.model || ''} ${v.color ? '- ' + v.color : ''} (${v.vehicle_type || ''})`,
              type: 'parking_vehicle' as const,
              url: `/app/pms/parking`
            }))
          ];

          // Aseguramos que el array completo cumpla con el tipo SearchResult[]
          setResults(searchResults as SearchResult[]);
          setIsLoading(false);
        }
      } catch (err) {
        const error = err as { name?: string; message?: string };
        // Ignorar errores de abort (request cancelada)
        if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
          return;
        }
        console.error('[GlobalSearch] Error al buscar:', error);
        if (isMountedRef.current && !abortController.signal.aborted) {
          setIsLoading(false);
          // En caso de error, mostrar solo las páginas predefinidas
          setResults(paginasTodas());
        }
      } finally {
        clearTimeout(watchdog);
        // Asegurar que isLoading se resete incluso si esta petición fue cancelada
        if (isMountedRef.current && !abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    // Iniciar la búsqueda
    fetchData();
    // Las páginas se leen por ref: cambiar de menú no debe relanzar la búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Limpiar al desmontar
  useEffect(() => {
    // Re-asignar en el cuerpo del efecto: en React 18 StrictMode el ciclo
    // mount -> cleanup -> mount dejaría el ref en false permanentemente
    // si solo se confía en el valor inicial de useRef(true).
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Función para actualizar el estado del query al escribir
  const handleInputChange = (value: string) => {
    // Evitar reactivar el spinner si el valor no cambió realmente (ej. re-emisión
    // redundante de onValueChange de cmdk), ya que en ese caso el efecto de
    // búsqueda no se re-ejecutaría (depende de debouncedQuery) y el spinner
    // quedaría colgado para siempre.
    const valueChanged = value !== query;
    setQuery(value);
    if (valueChanged && value.trim().length >= 1) {
      setIsLoading(true);
    } else if (value.trim() === '') {
      setResults(paginasIniciales());
      setIsLoading(false);
    }
  };

  // Manejar la selección de un resultado
  const handleSelect = (item: SearchResult) => {
    console.log('handleSelect llamado con:', item);
    if (!item || !item.url) {
      console.error('Error: Intento de navegar a un resultado sin URL');
      return;
    }
    
    // Cerrar el diálogo inmediatamente 
    setOpen(false);
    
    // Navegación directa usando un elemento <a>
    const navigateToUrl = () => {
      // Método más fiable para navegación entre páginas
      const link = document.createElement('a');
      link.href = item.url || '/';
      link.setAttribute('data-from-search', 'true');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('Navegación iniciada a:', item.url);
    };
    
    // Pequeño retraso para garantizar que la UI responde correctamente
    setTimeout(navigateToUrl, 10);
  };

  // Efecto para abrir el diálogo con atajo de teclado (Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openSearchDialog();
      }
    };
    
    document.addEventListener('keydown', down);
    window.addEventListener(ABRIR_BUSCADOR_EVENT, openSearchDialog);
    return () => {
      document.removeEventListener('keydown', down);
      window.removeEventListener(ABRIR_BUSCADOR_EVENT, openSearchDialog);
    };
    // openSearchDialog solo usa setters y refs estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Campo de búsqueda en el header - Versión responsive */}
      {!sinDisparador && (
      <div className="flex items-center justify-center">
        {/* Versión móvil - Solo icono (oculto si forceFullBar) */}
        {!forceFullBar && (
          <button
            onClick={openSearchDialog} 
            className="md:hidden p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </button>
        )}
        
        {/* Versión escritorio o forzada - Campo completo */}
        <div 
          onClick={openSearchDialog}
          className={`${forceFullBar ? 'flex w-full' : 'hidden md:flex w-60 lg:w-96'} items-center h-10 px-3 border rounded-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer focus-within:ring-1 focus-within:ring-blue-500 hover:border-blue-400 dark:hover:border-blue-500 transition-all shadow-sm`}
        >
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <div className="flex-grow truncate text-sm text-gray-500 dark:text-gray-400">
            Buscar páginas, clientes, sucursales...
          </div>
          <kbd className="ml-auto hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            Ctrl+K
          </kbd>
        </div>
      </div>
      )}

      {/* Diálogo de búsqueda con estructura revisada */}
      <CommandDialog 
        open={open} 
        onOpenChange={setOpen}
      >
        {/* Título requerido para accesibilidad */}
        <DialogTitle className="sr-only">Búsqueda global</DialogTitle>
        <DialogDescription className="sr-only">
          Buscar en organizaciones, clientes, productos y más
        </DialogDescription>
        
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={handleInputChange}
          placeholder="Buscar organizaciones, clientes, productos..."
          className="flex-1 py-3 text-base outline-none placeholder:text-gray-500 h-12 px-3 border-b"
          autoFocus
        />

        <CommandList className="max-h-[500px] overflow-y-auto py-2">
          {results.length === 0 && !isLoading && query.length > 0 && (
            <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No se encontraron resultados para «{query}»
              <p className="mt-2 text-xs">Intenta con otro término de búsqueda</p>
            </div>
          )}

          {/* Estado de carga */}
          {isLoading && (
            <div className="py-6 text-center">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Buscando...</p>
            </div>
          )}

          {/* Estado de resultados vacíos */}
          {!isLoading && results.length === 0 && query.length === 0 && (
            <CommandEmpty>
              <div className="py-6 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Escribe para buscar</p>
              </div>
            </CommandEmpty>
          )}

          {/* Resultados agrupados por tipo - usando componentes modulares */}
          <SearchResultGroup 
            heading="Páginas" 
            resultType="page" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Sucursales" 
            resultType="branch" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Clientes" 
            resultType="customer" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Productos" 
            resultType="product" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Proveedores" 
            resultType="supplier" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Categorías" 
            resultType="category" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Facturas" 
            resultType="invoice" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Pedidos Online" 
            resultType="web_order" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Reservas" 
            resultType="reservation" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Espacios" 
            resultType="space" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Membresías" 
            resultType="membership" 
            results={results} 
            onSelect={handleSelect} 
          />

          <SearchResultGroup 
            heading="Parqueadero" 
            resultType="parking_vehicle" 
            results={results} 
            onSelect={handleSelect} 
          />
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default GlobalSearch;
