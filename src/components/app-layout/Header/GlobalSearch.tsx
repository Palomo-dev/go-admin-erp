'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Users, Building2, Building, Briefcase, FileText, Package, User, Tags, ShoppingBag } from 'lucide-react';
// Volvemos a la importación correcta para App Router
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { 
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDebounce } from '../../../lib/hooks/useDebounce';
import { getOrganizationId } from '../../../lib/hooks/useOrganization';

// Componentes modulares
import { SearchResultGroup } from './GlobalSearch/SearchResultGroup';
import { searchData } from './GlobalSearch/searchService';
import { SearchResult, SearchResultType, PAGINAS_PREDEFINIDAS, PAGINAS_INICIALES } from './GlobalSearch/types';

/**
 * Componente de búsqueda global que permite buscar organizaciones, sucursales, 
 * usuarios, clientes, productos, etc.
 */
const GlobalSearch = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);
  const isMountedRef = useRef(true);
  
  // Función para abrir el diálogo de búsqueda
  const openSearchDialog = () => {
    setOpen(true);
    // Enfocar el input cuando se abre el diálogo
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  // Efecto para realizar la búsqueda cuando cambia el query debounceado
  useEffect(() => {
    // No realizar búsqueda si el query está vacío
    if (!debouncedQuery) {
      // Mostrar solo las páginas iniciales filtradas cuando no hay query
      // Aseguramos que el tipo coincide con SearchResult
      const paginasConTipoCorrecto = PAGINAS_INICIALES.map(page => ({
        ...page,
        type: page.type as SearchResultType // Aseguramos que el tipo es compatible
      }));
      
      setResults(paginasConTipoCorrecto);
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);

      try {
        // Usar el servicio modular para buscar datos
        const data = await searchData(debouncedQuery);

        // Solo actualizar el estado si el componente sigue montado
        if (isMountedRef.current) {
          // Convertir los resultados de la API a formato de resultado de búsqueda
          // Usamos una declaración de tipo más explícita
          const searchResults = [
            // Primero mostrar páginas que coincidan con la búsqueda
            ...PAGINAS_PREDEFINIDAS.filter(page => 
              page.name.toLowerCase().includes(debouncedQuery.toLowerCase())
            ).map(page => ({
              ...page,
              type: page.type as SearchResultType // Convertimos al tipo correcto
            })),

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
              url: `/app/sucursales/${branch.id}`
            })),

            // Usuarios
            ...(data.usuarios || []).map(user => ({
              id: user.id,
              name: `${user.first_name} ${user.last_name}`,
              description: user.email,
              type: 'user' as const,
              url: `/app/usuarios/${user.id}`
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
              url: `/app/inventario/categorias/${categoria.id}`
            }))
          ];

          // Aseguramos que el array completo cumpla con el tipo SearchResult[]
          setResults(searchResults as SearchResult[]);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error al buscar:', error);
        if (isMountedRef.current) {
          setIsLoading(false);
          // En caso de error, mostrar solo las páginas predefinidas
          const paginasConTipoCorrecto = PAGINAS_PREDEFINIDAS.map(page => ({
            ...page,
            type: page.type as SearchResultType // Aseguramos que el tipo es compatible
          }));
          setResults(paginasConTipoCorrecto);
        }
      }
    };

    // Iniciar la búsqueda
    fetchData();
  }, [debouncedQuery]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Función para actualizar el estado del query al escribir
  const handleInputChange = (value: string) => {
    setQuery(value);
    if (value.trim() === '') {
      // Reset a páginas iniciales filtradas cuando el campo está vacío
      const paginasConTipoCorrecto = PAGINAS_INICIALES.map(page => ({
        ...page,
        type: page.type as SearchResultType // Aseguramos que el tipo es compatible
      }));
      setResults(paginasConTipoCorrecto);
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
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      {/* Campo de búsqueda en el header - Versión responsive */}
      <div className="flex items-center justify-center">
        {/* Versión móvil - Solo icono */}
        <button
          onClick={openSearchDialog} 
          className="md:hidden p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
          aria-label="Buscar"
        >
          <Search className="h-5 w-5" />
        </button>
        
        {/* Versión escritorio - Campo completo */}
        <div 
          onClick={openSearchDialog}
          className="hidden md:flex items-center w-60 lg:w-96 h-10 px-3 border rounded-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer focus-within:ring-1 focus-within:ring-blue-500 hover:border-blue-400 dark:hover:border-blue-500 transition-all shadow-sm"
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
        
        <div className="flex items-center px-3 border-b">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={handleInputChange}
            placeholder="Buscar organizaciones, clientes, productos..."
            className="flex-1 py-3 text-base outline-none placeholder:text-gray-500 h-12"
            autoFocus
          />
        </div>

        <CommandList className="max-h-[500px] overflow-y-auto py-2">
          {results.length === 0 && !isLoading && query.length > 0 && (
            <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No se encontraron resultados para "{query}"
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
            heading="Organizaciones" 
            resultType="organization" 
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
            heading="Usuarios" 
            resultType="user" 
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
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default GlobalSearch;
