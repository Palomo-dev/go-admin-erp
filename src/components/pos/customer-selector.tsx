import React, { useState, useEffect } from "react";
import { User, Search, Plus, Loader2 } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { Card, CardContent } from "./card";
import { supabase } from "@/lib/supabase/config";

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  notes?: string;
  organization_id: string;
}

interface CustomerSelectorProps {
  organizationId: string;
  onSelectCustomer: (customer: Customer) => void;
  selectedCustomerId?: string;
}

export function CustomerSelector({ 
  organizationId, 
  onSelectCustomer,
  selectedCustomerId 
}: CustomerSelectorProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    full_name: "",
    email: "",
    phone: ""
  });

  // Cargar clientes desde Supabase
  useEffect(() => {
    const loadCustomers = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("organization_id", organizationId)
          .order("full_name", { ascending: true });
          
        if (error) {
          console.error("Error al cargar clientes:", error);
          throw error;
        }
        
        setCustomers(data || []);
        setFilteredCustomers(data || []);
      } catch (err) {
        console.error("Error al cargar clientes:", err);
      } finally {
        setLoading(false);
      }
    };
    
    if (organizationId) {
      loadCustomers();
    }
  }, [organizationId]);

  // Filtrar clientes según término de búsqueda
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredCustomers(customers);
    } else {
      const filtered = customers.filter(
        customer => 
          customer.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.phone?.includes(searchTerm)
      );
      setFilteredCustomers(filtered);
    }
  }, [searchTerm, customers]);

  // Manejar la búsqueda
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Manejar cambios en el formulario de nuevo cliente
  const handleNewCustomerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewCustomer(prev => ({ ...prev, [name]: value }));
  };

  // Crear nuevo cliente
  const handleCreateCustomer = async () => {
    if (!newCustomer.full_name.trim()) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert([{
          full_name: newCustomer.full_name,
          email: newCustomer.email || null,
          phone: newCustomer.phone || null,
          organization_id: organizationId,
          is_registered: false
        }])
        .select();
        
      if (error) {
        console.error("Error al crear cliente:", error);
        throw error;
      }
      
      if (data && data[0]) {
        // Agregar el nuevo cliente a la lista y seleccionarlo
        setCustomers([...customers, data[0]]);
        onSelectCustomer(data[0]);
        
        // Resetear el formulario
        setNewCustomer({ full_name: "", email: "", phone: "" });
        setShowForm(false);
      }
    } catch (err) {
      console.error("Error al crear cliente:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <Input
            type="text"
            placeholder="Buscar cliente..."
            value={searchTerm}
            onChange={handleSearch}
            className="pl-10 w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowForm(!showForm)}
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </Button>
      </div>
      
      {showForm && (
        <Card className="mb-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-3 text-gray-800 dark:text-gray-200">Agregar nuevo cliente</h4>
            <div className="space-y-3">
              <Input
                name="full_name"
                placeholder="Nombre completo *"
                value={newCustomer.full_name}
                onChange={handleNewCustomerChange}
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
              />
              <Input
                name="email"
                type="email"
                placeholder="Correo electrónico"
                value={newCustomer.email}
                onChange={handleNewCustomerChange}
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
              />
              <Input
                name="phone"
                type="tel"
                placeholder="Teléfono"
                value={newCustomer.phone}
                onChange={handleNewCustomerChange}
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!newCustomer.full_name || loading}
                  onClick={handleCreateCustomer}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear cliente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="h-[300px] overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500 dark:text-blue-400" />
          </div>
        ) : filteredCustomers.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredCustomers.map(customer => (
              <div
                key={customer.id}
                className={`
                  p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750
                  ${selectedCustomerId === customer.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                `}
                onClick={() => onSelectCustomer(customer)}
              >
                <div className="flex items-center">
                  <User className="h-5 w-5 text-gray-400 dark:text-gray-500 mr-2" />
                  <div>
                    <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">{customer.full_name}</h4>
                    {(customer.email || customer.phone) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {customer.phone || ''} {customer.email ? `• ${customer.email}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <User className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchTerm ? "No se encontraron clientes" : "No hay clientes registrados"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
