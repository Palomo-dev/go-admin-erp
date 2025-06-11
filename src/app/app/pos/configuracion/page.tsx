"use client";

import React, { useState } from "react";
import { Button } from "@/components/pos/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/pos/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/pos/tabs";
import { Input } from "@/components/pos/input";
import { Badge } from "@/components/pos/badge";
import Link from "next/link";

// Interfaces
interface POSConfig {
  general: {
    taxRate: number;
    receiptHeader: string;
    receiptFooter: string;
    printAfterSale: boolean;
    askForClientInfo: boolean;
    allowDiscounts: boolean;
    maxDiscount: number;
  };
  restaurant: {
    enableTables: boolean;
    enableKitchenTickets: boolean;
    requireServerForOrder: boolean;
    defaultTip: number;
    zones: string[];
  };
  payments: {
    enabledMethods: string[];
    allowPartialPayments: boolean;
    allowPendingPayments: boolean;
    maxDaysForPayment: number;
  };
}

export default function ConfiguracionPOSPage() {
  // Estado para las configuraciones
  const [config, setConfig] = useState<POSConfig>({
    general: {
      taxRate: 16,
      receiptHeader: "Mi Negocio, S.A. de C.V.\nAv. Principal #123\nTel: 555-123-4567",
      receiptFooter: "¡Gracias por su preferencia!\nVisítenos en www.minegocio.com",
      printAfterSale: true,
      askForClientInfo: false,
      allowDiscounts: true,
      maxDiscount: 20,
    },
    restaurant: {
      enableTables: true,
      enableKitchenTickets: true,
      requireServerForOrder: false,
      defaultTip: 10,
      zones: ["Terraza", "Interior", "Barra", "VIP"],
    },
    payments: {
      enabledMethods: ["cash", "card", "transfer", "credit"],
      allowPartialPayments: true,
      allowPendingPayments: true,
      maxDaysForPayment: 30,
    }
  });

  // Estado para la pestaña activa
  const [activeTab, setActiveTab] = useState("general");
  
  // Estado para indicar si hay cambios sin guardar
  const [hasChanges, setHasChanges] = useState(false);

  // Función para actualizar las configuraciones generales
  const handleGeneralChange = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      general: {
        ...prev.general,
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  // Función para actualizar las configuraciones de restaurante
  const handleRestaurantChange = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      restaurant: {
        ...prev.restaurant,
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  // Función para actualizar las configuraciones de pagos
  const handlePaymentsChange = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      payments: {
        ...prev.payments,
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  // Función para manejar los métodos de pago
  const togglePaymentMethod = (method: string) => {
    setConfig(prev => {
      const enabledMethods = [...prev.payments.enabledMethods];
      
      if (enabledMethods.includes(method)) {
        // Remover el método
        const index = enabledMethods.indexOf(method);
        enabledMethods.splice(index, 1);
      } else {
        // Agregar el método
        enabledMethods.push(method);
      }
      
      return {
        ...prev,
        payments: {
          ...prev.payments,
          enabledMethods
        }
      };
    });
    setHasChanges(true);
  };

  // Función para agregar una nueva zona
  const addZone = (zone: string) => {
    if (zone.trim() && !config.restaurant.zones.includes(zone)) {
      setConfig(prev => ({
        ...prev,
        restaurant: {
          ...prev.restaurant,
          zones: [...prev.restaurant.zones, zone.trim()]
        }
      }));
      setHasChanges(true);
    }
  };

  // Función para eliminar una zona
  const removeZone = (zone: string) => {
    setConfig(prev => ({
      ...prev,
      restaurant: {
        ...prev.restaurant,
        zones: prev.restaurant.zones.filter(z => z !== zone)
      }
    }));
    setHasChanges(true);
  };

  // Función para guardar configuraciones
  const saveConfig = () => {
    // Aquí se implementaría la conexión a Supabase para guardar las configuraciones
    console.log("Configuraciones guardadas:", config);
    alert("Configuraciones guardadas exitosamente");
    setHasChanges(false);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Configuración del POS</h1>
          <p className="text-gray-600">
            Personaliza el comportamiento del punto de venta
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="warning">Cambios sin guardar</Badge>
          )}
          <Link href="/app/pos">
            <Button variant="outline" className="mr-2">
              Volver a POS
            </Button>
          </Link>
          <Button onClick={saveConfig} disabled={!hasChanges}>
            Guardar Configuración
          </Button>
        </div>
      </div>

      {/* Pestañas de configuración */}
      <Tabs defaultValue="general" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="general">Configuración General</TabsTrigger>
          <TabsTrigger value="restaurant">Restaurante y Mesas</TabsTrigger>
          <TabsTrigger value="payments">Pagos y Facturación</TabsTrigger>
        </TabsList>

        {/* Configuración General */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuraciones Generales</CardTitle>
              <CardDescription>Ajustes básicos para el punto de venta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Impuesto (%)
                  </label>
                  <Input
                    type="number"
                    value={config.general.taxRate}
                    min={0}
                    max={100}
                    onChange={(e) => handleGeneralChange('taxRate', Number(e.target.value))}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Descuento Máximo (%)
                  </label>
                  <Input
                    type="number"
                    value={config.general.maxDiscount}
                    min={0}
                    max={100}
                    onChange={(e) => handleGeneralChange('maxDiscount', Number(e.target.value))}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Encabezado del Ticket
                  </label>
                  <textarea 
                    className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                    value={config.general.receiptHeader}
                    onChange={(e) => handleGeneralChange('receiptHeader', e.target.value)}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Pie de Página del Ticket
                  </label>
                  <textarea 
                    className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                    value={config.general.receiptFooter}
                    onChange={(e) => handleGeneralChange('receiptFooter', e.target.value)}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    id="printAfterSale"
                    checked={config.general.printAfterSale}
                    onChange={(e) => handleGeneralChange('printAfterSale', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="printAfterSale" className="text-sm">
                    Imprimir ticket automáticamente
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    id="askForClientInfo"
                    checked={config.general.askForClientInfo}
                    onChange={(e) => handleGeneralChange('askForClientInfo', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="askForClientInfo" className="text-sm">
                    Solicitar datos de cliente
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    id="allowDiscounts"
                    checked={config.general.allowDiscounts}
                    onChange={(e) => handleGeneralChange('allowDiscounts', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="allowDiscounts" className="text-sm">
                    Permitir descuentos
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuración Restaurante y Mesas */}
        <TabsContent value="restaurant" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Restaurante y Mesas</CardTitle>
              <CardDescription>Configura opciones para gestión de mesas y áreas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="enableTables"
                      checked={config.restaurant.enableTables}
                      onChange={(e) => handleRestaurantChange('enableTables', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="enableTables" className="text-sm">
                      Habilitar gestión de mesas
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="enableKitchenTickets"
                      checked={config.restaurant.enableKitchenTickets}
                      onChange={(e) => handleRestaurantChange('enableKitchenTickets', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="enableKitchenTickets" className="text-sm">
                      Habilitar comandas a cocina
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="requireServerForOrder"
                      checked={config.restaurant.requireServerForOrder}
                      onChange={(e) => handleRestaurantChange('requireServerForOrder', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="requireServerForOrder" className="text-sm">
                      Requerir mesero para órdenes
                    </label>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Propina predeterminada (%)
                    </label>
                    <Input
                      type="number"
                      value={config.restaurant.defaultTip}
                      min={0}
                      max={100}
                      onChange={(e) => handleRestaurantChange('defaultTip', Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* Configuración de zonas */}
                <div className="mt-6">
                  <h3 className="text-md font-medium mb-2">Zonas / Áreas</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex gap-2">
                      <Input 
                        type="text" 
                        placeholder="Agregar nueva zona..."
                        id="newZone"
                      />
                      <Button 
                        onClick={() => {
                          const input = document.getElementById('newZone') as HTMLInputElement;
                          addZone(input.value);
                          input.value = '';
                        }}
                      >
                        Agregar
                      </Button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                      {config.restaurant.zones.map((zone, index) => (
                        <div 
                          key={index} 
                          className="bg-gray-100 rounded-md px-3 py-1 flex items-center gap-2"
                        >
                          <span>{zone}</span>
                          <button 
                            onClick={() => removeZone(zone)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuración Pagos y Facturación */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pagos y Facturación</CardTitle>
              <CardDescription>Configura métodos de pago y opciones de facturación</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <h3 className="text-md font-medium mb-2">Métodos de Pago Habilitados</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="payment-cash"
                      checked={config.payments.enabledMethods.includes('cash')}
                      onChange={() => togglePaymentMethod('cash')}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="payment-cash" className="text-sm">
                      Efectivo
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="payment-card"
                      checked={config.payments.enabledMethods.includes('card')}
                      onChange={() => togglePaymentMethod('card')}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="payment-card" className="text-sm">
                      Tarjeta
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="payment-transfer"
                      checked={config.payments.enabledMethods.includes('transfer')}
                      onChange={() => togglePaymentMethod('transfer')}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="payment-transfer" className="text-sm">
                      Transferencia
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="payment-credit"
                      checked={config.payments.enabledMethods.includes('credit')}
                      onChange={() => togglePaymentMethod('credit')}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="payment-credit" className="text-sm">
                      Crédito
                    </label>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="allowPartialPayments"
                      checked={config.payments.allowPartialPayments}
                      onChange={(e) => handlePaymentsChange('allowPartialPayments', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="allowPartialPayments" className="text-sm">
                      Permitir pagos parciales
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox"
                      id="allowPendingPayments"
                      checked={config.payments.allowPendingPayments}
                      onChange={(e) => handlePaymentsChange('allowPendingPayments', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="allowPendingPayments" className="text-sm">
                      Permitir pagos pendientes
                    </label>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Días máximos para pagos pendientes
                    </label>
                    <Input
                      type="number"
                      value={config.payments.maxDaysForPayment}
                      min={1}
                      max={365}
                      onChange={(e) => handlePaymentsChange('maxDaysForPayment', Number(e.target.value))}
                      disabled={!config.payments.allowPendingPayments}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
