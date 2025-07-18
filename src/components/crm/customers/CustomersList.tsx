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
    <Card className={cn("w-full", theme === "dark" ? "border-gray-800" : "border-gray-200")}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Clientes</CardTitle>
            <CardDescription>Listado de clientes registrados en el sistema</CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-full sm:w-64"
              />
            </div>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Nuevo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2">Cargando clientes...</span>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500">
            <p>Error: {error}</p>
            <Button 
              variant="outline" 
              className="mt-2" 
              onClick={() => window.location.reload()}
            >
              Reintentar
            </Button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {searchQuery ? (
              <p>No se encontraron clientes que coincidan con "{searchQuery}"</p>
            ) : (
              <p>No hay clientes registrados. ¡Agrega tu primer cliente!</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Etiquetas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow key={customer.id} className="cursor-pointer hover:bg-muted">
                    <TableCell className="font-medium">{customer.full_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        {customer.email && <span className="text-sm">{customer.email}</span>}
                        {customer.phone && <span className="text-sm text-muted-foreground">{customer.phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {customer.doc_type} {customer.doc_number}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {customer.tags && customer.tags.map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
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
