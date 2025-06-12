"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function ReportesPage() {
  // Estados para las diferentes pestañas y filtros
  const [dateRange, setDateRange] = useState("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeTab, setActiveTab] = useState("ventas");

  // Datos simulados para el reporte de ventas
  const salesData = {
    total: 12580.75,
    count: 78,
    average: 161.29,
    byMethod: [
      { method: "Efectivo", amount: 5230.50, count: 32 },
      { method: "Tarjeta", amount: 4980.25, count: 28 },
      { method: "Transferencia", amount: 1870.00, count: 12 },
      { method: "Otro", amount: 500.00, count: 6 }
    ],
    byHour: [
      { hour: "08:00", sales: 780.50, count: 5 },
      { hour: "09:00", sales: 1250.25, count: 8 },
      { hour: "10:00", sales: 950.00, count: 6 },
      { hour: "11:00", sales: 1480.75, count: 10 },
      { hour: "12:00", sales: 1820.50, count: 12 },
      { hour: "13:00", sales: 2150.25, count: 14 },
      { hour: "14:00", sales: 1580.50, count: 9 },
      { hour: "15:00", sales: 1280.00, count: 8 },
      { hour: "16:00", sales: 890.50, count: 5 },
      { hour: "17:00", sales: 397.50, count: 1 }
    ]
  };

  // Datos simulados para productos más vendidos
  const topProducts = [
    { id: 1, name: "Hamburguesa Clásica", quantity: 45, total: 2250.00 },
    { id: 2, name: "Refresco Grande", quantity: 38, total: 760.00 },
    { id: 3, name: "Papas Fritas", quantity: 36, total: 720.00 },
    { id: 4, name: "Pizza Familiar", quantity: 15, total: 2250.00 },
    { id: 5, name: "Ensalada César", quantity: 12, total: 840.00 }
  ];

  // Función para manejar el cambio de rango de fechas
  const handleDateRangeChange = (range: string) => {
    setDateRange(range);
    
    // Configurar fechas predeterminadas según rango
    const today = new Date();
    let start = new Date();
    
    switch(range) {
      case "today":
        setStartDate(today.toISOString().split("T")[0]);
        setEndDate(today.toISOString().split("T")[0]);
        break;
      case "yesterday":
        start.setDate(today.getDate() - 1);
        setStartDate(start.toISOString().split("T")[0]);
        setEndDate(start.toISOString().split("T")[0]);
        break;
      case "week":
        start.setDate(today.getDate() - 7);
        setStartDate(start.toISOString().split("T")[0]);
        setEndDate(today.toISOString().split("T")[0]);
        break;
      case "month":
        start.setMonth(today.getMonth() - 1);
        setStartDate(start.toISOString().split("T")[0]);
        setEndDate(today.toISOString().split("T")[0]);
        break;
      case "custom":
        // No hacer nada, el usuario configurará las fechas
        break;
    }
  };

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return amount.toFixed(2);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Reportes de Punto de Venta</h1>
          <p className="text-gray-600">
            Visualización y exportación de datos de ventas y productos
          </p>
        </div>
        <div>
          <Link href="/app/pos">
            <Button variant="outline" className="mr-2">
              Volver a POS
            </Button>
          </Link>
          <Button>
            Exportar a Excel
          </Button>
        </div>
      </div>

      {/* Filtros de fecha */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Rango de Fechas</label>
              <select
                className="w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors h-9"
                value={dateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
              >
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="week">Últimos 7 días</option>
                <option value="month">Último mes</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
            
            {dateRange === "custom" && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Desde</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hasta</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
            
            {dateRange !== "custom" && (
              <div className="md:col-span-2 flex items-end">
                <Button variant="outline">
                  Aplicar Filtros
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pestañas de reportes */}
      <Tabs defaultValue="ventas" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 mb-6">
          <TabsTrigger value="ventas">Resumen de Ventas</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="metodos">Métodos de Pago</TabsTrigger>
        </TabsList>

        {/* Contenido de Ventas */}
        <TabsContent value="ventas" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Total Ventas</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-3xl font-bold">${formatCurrency(salesData.total)}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {salesData.count} transacciones
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Ticket Promedio</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-3xl font-bold">${formatCurrency(salesData.average)}</div>
                <div className="text-sm text-gray-500 mt-1">
                  Por transacción
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Productos Vendidos</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="text-3xl font-bold">146</div>
                <div className="text-sm text-gray-500 mt-1">
                  15 productos únicos
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Gráfica de ventas por hora - Aquí se podría integrar una librería de gráficas */}
          <Card>
            <CardHeader>
              <CardTitle>Ventas por Hora</CardTitle>
            </CardHeader>
            <CardContent className="h-80 p-4">
              <div className="bg-gray-50 h-full rounded-md flex items-end justify-around p-4">
                {/* Simulación básica de una gráfica de barras */}
                {salesData.byHour.map((hour, index) => (
                  <div key={index} className="flex flex-col items-center">
                    <div 
                      className="bg-blue-500 w-12 rounded-t-md" 
                      style={{ height: `${(hour.sales / 2200) * 100}%` }}
                    ></div>
                    <div className="text-xs mt-1">{hour.hour}</div>
                    <div className="text-xs">${formatCurrency(hour.sales)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contenido de Productos */}
        <TabsContent value="productos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Productos Más Vendidos</CardTitle>
              <CardDescription>Top 5 productos por cantidad vendida</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex justify-between p-2 border-b last:border-0">
                    <div>
                      <span className="font-medium">{product.name}</span>
                      <div className="text-sm text-gray-500">
                        {product.quantity} unidades
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">${formatCurrency(product.total)}</div>
                      <div className="text-sm text-gray-500">
                        ${formatCurrency(product.total / product.quantity)} c/u
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          {/* Aquí se podrían agregar más secciones para productos */}
        </TabsContent>

        {/* Contenido de Clientes - Simplemente un placeholder */}
        <TabsContent value="clientes">
          <Card>
            <CardHeader>
              <CardTitle>Reporte de Clientes</CardTitle>
              <CardDescription>Análisis de clientes y compras</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center p-8 text-gray-500">
                Para acceder a reportes detallados de clientes, por favor integre el módulo de CRM.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contenido de Métodos de Pago */}
        <TabsContent value="metodos">
          <Card>
            <CardHeader>
              <CardTitle>Métodos de Pago</CardTitle>
              <CardDescription>Distribución de ventas por método de pago</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {salesData.byMethod.map((method, index) => (
                  <div key={index} className="p-3 border rounded-md">
                    <div className="flex justify-between">
                      <span className="font-medium">{method.method}</span>
                      <span className="font-medium">${formatCurrency(method.amount)}</span>
                    </div>
                    <div className="bg-gray-100 h-2 mt-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          index === 0 ? 'bg-green-500' : 
                          index === 1 ? 'bg-blue-500' : 
                          index === 2 ? 'bg-purple-500' : 'bg-yellow-500'
                        }`}
                        style={{ width: `${(method.amount / salesData.total) * 100}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {method.count} transacciones - {((method.amount / salesData.total) * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
