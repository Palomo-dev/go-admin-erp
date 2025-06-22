"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import { cn } from "@/utils/Utils";
import { Customer } from "./use-multi-client";

interface CustomerSelectorProps {
  currentCustomer: Customer;
  onSelectCustomer: (customer: Customer) => void;
  onCreateCustomer: (data: { full_name: string; email?: string; phone?: string }) => Promise<Customer | null>;
  onSearch: (query: string) => Promise<Customer[]>;
}

export function CustomerSelector({
  currentCustomer,
  onSelectCustomer,
  onCreateCustomer,
  onSearch
}: CustomerSelectorProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [newCustomer, setNewCustomer] = useState({
    full_name: "",
    email: "",
    phone: ""
  });
  
  const [showNewForm, setShowNewForm] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  // Buscar clientes cuando cambia el query
  useEffect(() => {
    const searchCustomers = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }
      
      setLoading(true);
      try {
        const results = await onSearch(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error("Error al buscar clientes:", error);
      } finally {
        setLoading(false);
      }
    };
    
    const timeoutId = setTimeout(searchCustomers, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, onSearch]);
  
  const handleCreateCustomer = async () => {
    if (!newCustomer.full_name) return;
    
    try {
      const customer = await onCreateCustomer({
        full_name: newCustomer.full_name,
        email: newCustomer.email || undefined,
        phone: newCustomer.phone || undefined
      });
      
      if (customer) {
        setShowNewForm(false);
        setIsOpen(false);
        setNewCustomer({
          full_name: "",
          email: "",
          phone: ""
        });
      }
    } catch (error) {
      console.error("Error al crear cliente:", error);
    }
  };
  
  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        variant="outline"
        className={cn(
          "w-full justify-between overflow-hidden",
          isDark ? "bg-slate-800 text-white" : ""
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">{currentCustomer.full_name}</span>
        <span className="ml-2">▼</span>
      </Button>
      
      {isOpen && (
        <div className={cn(
          "absolute z-50 mt-1 w-full rounded-md border shadow-lg",
          isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"
        )}>
          <div className="p-2">
            <Input
              placeholder="Buscar cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={isDark ? "bg-slate-700 text-white border-slate-600" : ""}
            />
          </div>
          
          <div className="max-h-60 overflow-auto">
            {loading ? (
              <div className={cn(
                "p-2 text-center text-sm",
                isDark ? "text-gray-300" : "text-gray-500"
              )}>
                Buscando...
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((customer) => (
                <div
                  key={customer.id}
                  className={cn(
                    "p-2 cursor-pointer hover:bg-blue-100 truncate",
                    isDark ? "hover:bg-blue-900 text-white" : ""
                  )}
                  onClick={() => {
                    onSelectCustomer(customer);
                    setIsOpen(false);
                  }}
                >
                  <div>{customer.full_name}</div>
                  {customer.email && (
                    <div className={cn(
                      "text-sm",
                      isDark ? "text-gray-300" : "text-gray-500"
                    )}>
                      {customer.email}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className={cn(
                "p-2 text-center text-sm",
                isDark ? "text-gray-300" : "text-gray-500"
              )}>
                {searchQuery.length >= 2 ? "No hay resultados" : "Escribe para buscar"}
              </div>
            )}
          </div>
          
          <div className="p-2 border-t">
            {showNewForm ? (
              <div className="space-y-2">
                <Input
                  placeholder="Nombre completo *"
                  value={newCustomer.full_name}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, full_name: e.target.value }))}
                  className={isDark ? "bg-slate-700 text-white border-slate-600" : ""}
                />
                <Input
                  placeholder="Email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                  className={isDark ? "bg-slate-700 text-white border-slate-600" : ""}
                />
                <Input
                  placeholder="Teléfono"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                  className={isDark ? "bg-slate-700 text-white border-slate-600" : ""}
                />
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowNewForm(false)}
                    className={isDark ? "bg-slate-700 hover:bg-slate-600 text-white" : ""}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateCustomer}>Crear</Button>
                </div>
              </div>
            ) : (
              <Button 
                variant="outline" 
                onClick={() => setShowNewForm(true)}
                className={cn(
                  "w-full",
                  isDark ? "bg-slate-700 hover:bg-slate-600 text-white" : ""
                )}
              >
                Nuevo Cliente
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
