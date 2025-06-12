"use client";

import React, { useState } from "react";
import { Button } from "@/components/pos/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Input } from "@/components/pos/input";
import Link from "next/link";

// Interfaces
interface ReturnedItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  reason: string;
}

interface ReturnOrder {
  id: number;
  sale_id: string;
  date: string;
  customer: {
    id: number;
    name: string;
  };
  total: number;
  status: "pendiente" | "completado" | "cancelado";
  items: ReturnedItem[];
}

export default function DevolucionesPage() {
  // Estado para filtros
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [currentReturn, setCurrentReturn] = useState<ReturnOrder | null>(null);

  // Datos simulados de devoluciones
  const [returns, setReturns] = useState<ReturnOrder[]>([
    {
      id: 1,
      sale_id: "V-2025-0145",
      date: "2025-06-08",
      customer: { id: 1, name: "Juan Pérez" },
      total: 120.50,
      status: "completado",
      items: [
        {
          id: 1,
          product_name: "Camisa Roja Talla L",
          quantity: 1,
          unit_price: 85.00,
          total: 85.00,
          reason: "Talla incorrecta"
        },
        {
          id: 2,
          product_name: "Calcetines Deportivos",
          quantity: 2,
          unit_price: 17.75,
          total: 35.50,
          reason: "Defecto de fábrica"
        }
      ]
    },
    {
      id: 2,
      sale_id: "V-2025-0158",
      date: "2025-06-09",
      customer: { id: 2, name: "María González" },
      total: 350.00,
      status: "pendiente",
      items: [
        {
          id: 3,
          product_name: "Licuadora 7 Velocidades",
          quantity: 1,
          unit_price: 350.00,
          total: 350.00,
          reason: "No funciona correctamente"
        }
      ]
    },
    {
      id: 3,
      sale_id: "V-2025-0160",
      date: "2025-06-10",
      customer: { id: 3, name: "Carlos Rodríguez" },
      total: 75.25,
      status: "cancelado",
      items: [
        {
          id: 4,
          product_name: "Libro Historia de México",
          quantity: 1,
          unit_price: 75.25,
          total: 75.25,
          reason: "Cambio de opinión del cliente"
        }
      ]
    }
  ]);

  // Filtrar devoluciones según búsqueda y filtro
  const filteredReturns = returns.filter(returnOrder => {
    // Filtro por texto
    const matchesSearch = 
      returnOrder.customer.name.toLowerCase().includes(search.toLowerCase()) ||
      returnOrder.sale_id.toLowerCase().includes(search.toLowerCase()) ||
      returnOrder.items.some(item => 
        item.product_name.toLowerCase().includes(search.toLowerCase())
      );
    
    // Filtro por estado
    const matchesFilter = 
      filter === "all" || 
      returnOrder.status === filter;
    
    return matchesSearch && matchesFilter;
  });

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return amount.toFixed(2);
  };

  // Función para formatear fecha
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short", 
      year: "numeric"
    });
  };

  // Función para obtener color según estado
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "pendiente":
        return "warning";
      case "completado":
        return "success";
      case "cancelado":
        return "destructive";
      default:
        return "secondary";
    }
  };

  // Función para mostrar texto de estado
  const getStatusText = (status: string) => {
    switch (status) {
      case "pendiente":
        return "Pendiente";
      case "completado":
        return "Completado";
      case "cancelado":
        return "Cancelado";
      default:
        return status;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Devoluciones</h1>
          <p className="text-gray-600">
            {filteredReturns.length} devoluciones
          </p>
        </div>
        <div>
          <Link href="/app/pos">
            <Button variant="outline" className="mr-2">
              Volver a POS
            </Button>
          </Link>
          <Button>
            Nueva Devolución
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Buscar por Cliente, Venta o Producto
              </label>
              <Input
                type="text"
                placeholder="Nombre de cliente o referencia de venta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Filtrar por Estado
              </label>
              <select
                className="w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors h-9"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todos los estados</option>
                <option value="pendiente">Pendientes</option>
                <option value="completado">Completados</option>
                <option value="cancelado">Cancelados</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Resumen
              </label>
              <div className="flex gap-2">
                <Badge variant="warning">Pendientes: {returns.filter(r => r.status === "pendiente").length}</Badge>
                <Badge variant="success">Completados: {returns.filter(r => r.status === "completado").length}</Badge>
                <Badge variant="destructive">Cancelados: {returns.filter(r => r.status === "cancelado").length}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Listado de devoluciones */}
      <div className="space-y-4">
        {filteredReturns.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">No hay devoluciones con los filtros seleccionados</p>
            </CardContent>
          </Card>
        ) : (
          filteredReturns.map((returnOrder) => (
            <Card key={returnOrder.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="py-3 px-4 bg-gray-50 flex flex-row justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-md">Devolución #{returnOrder.id}</CardTitle>
                    <Badge variant={getStatusBadgeVariant(returnOrder.status)}>
                      {getStatusText(returnOrder.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500">
                    Venta: {returnOrder.sale_id} • {formatDate(returnOrder.date)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-medium">Cliente: {returnOrder.customer.name}</div>
                  <div className="text-md font-bold">
                    Total: ${formatCurrency(returnOrder.total)}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-4">
                <div className="mb-3">
                  <h3 className="font-medium mb-2">Productos Devueltos</h3>
                  <div className="bg-gray-50 rounded-md p-2">
                    {returnOrder.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center py-1 border-b last:border-0">
                        <div>
                          <span className="font-medium">{item.product_name}</span>
                          <div className="text-sm text-gray-500">
                            Razón: {item.reason}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm">
                            {item.quantity} x ${formatCurrency(item.unit_price)}
                          </div>
                          <div className="font-medium">
                            ${formatCurrency(item.total)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-2 justify-end">
                  <Button variant="outline">
                    Ver Detalles
                  </Button>
                  {returnOrder.status === "pendiente" && (
                    <>
                      <Button variant="success">
                        Aprobar
                      </Button>
                      <Button variant="destructive">
                        Rechazar
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
