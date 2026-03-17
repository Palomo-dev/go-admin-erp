'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { Search, Loader2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  doc_type: string;
  doc_number: string;
  tags?: string[];
  created_at: string;
}

export function CustomersList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { theme } = useTheme();

  // Obtener el ID de la organización activa desde localStorage
  const getOrganizationId = () => {
    if (typeof window !== 'undefined') {
      const orgData = localStorage.getItem('organizacionActiva');
      if (orgData) {
        try {
          const parsed = JSON.parse(orgData);
          return parsed?.id || null;
        } catch (err) {
          console.error('Error al parsear la organización:', err);
          return null;
        }
      }
    }
    return null;
  };

  // Cargar los clientes al montar el componente
  useEffect(() => {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      setError('No se encontró una organización activa');
      setIsLoading(false);
      return;
    }

    const fetchCustomers = async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        setCustomers(data || []);
        setFilteredCustomers(data || []);
      } catch (err: any) {
        console.error('Error al cargar los clientes:', err);
        setError(err.message || 'Error al cargar los clientes');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  // Filtrar clientes cuando cambia la búsqueda
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCustomers(customers);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = customers.filter(customer => 
      (customer.full_name && customer.full_name.toLowerCase().includes(query)) ||
      (customer.email && customer.email.toLowerCase().includes(query)) ||
      (customer.phone && customer.phone.includes(query)) ||
      (customer.doc_number && customer.doc_number.includes(query))
    );
    
    setFilteredCustomers(filtered);
  }, [searchQuery, customers]);

  return (
    <Card className={cn("w-full bg-white dark:bg-gray-800", theme === "dark" ? "border-gray-700" : "border-gray-200")}>
      <CardHeader className="p-3 sm:p-4 md:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div>
            <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">Clientes</CardTitle>
            <CardDescription className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Listado de clientes registrados en el sistema</CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 dark:text-gray-400" />
              <Input
                placeholder="Buscar cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 sm:pl-8 w-full sm:w-64 h-8 sm:h-9 text-xs sm:text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <Button size="sm" className="h-8 sm:h-9 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white">
              <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Nuevo</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
        {isLoading ? (
          <div className="flex justify-center items-center py-6 sm:py-8">
            <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Cargando clientes...</span>
          </div>
        ) : error ? (
          <div className="py-6 sm:py-8 text-center text-red-500 dark:text-red-400">
            <p className="text-sm">Error: {error}</p>
            <Button 
              variant="outline" 
              className="mt-2 text-xs sm:text-sm border-gray-300 dark:border-gray-600" 
              onClick={() => window.location.reload()}
            >
              Reintentar
            </Button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-6 sm:py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
            {searchQuery ? (
              <p>No se encontraron clientes que coincidan con &quot;{searchQuery}&quot;</p>
            ) : (
              <p>No hay clientes registrados. ¡Agrega tu primer cliente!</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold">Nombre</TableHead>
                  <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold">Contacto</TableHead>
                  <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold hidden md:table-cell">Documento</TableHead>
                  <TableHead className="text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-semibold hidden sm:table-cell">Etiquetas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700/50">
                    <TableCell className="py-2 sm:py-3 font-medium text-xs sm:text-sm text-gray-900 dark:text-white">{customer.full_name}</TableCell>
                    <TableCell className="py-2 sm:py-3">
                      <div className="flex flex-col">
                        {customer.email && <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{customer.email}</span>}
                        {customer.phone && <span className="text-[10px] sm:text-sm text-gray-500 dark:text-gray-400">{customer.phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 sm:py-3 hidden md:table-cell">
                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                        {customer.doc_type} {customer.doc_number}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {customer.tags && customer.tags.map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px] sm:text-xs border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
