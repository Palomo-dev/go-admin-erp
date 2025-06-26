"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/pos/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Input } from "@/components/pos/input";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase, getUserOrganization } from "@/lib/supabase/config";

// Interfaces
interface CartItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
}

interface PaymentMethod {
  id: number;
  name: string;
  icon?: string;
  supportsParcial?: boolean;
}

interface Payment {
  id: number;
  methodId: number;
  methodName: string;
  amount: number;
  reference?: string;
}

export default function CobroPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mesaId = searchParams.get("mesa");
  const cartId = searchParams.get("cartId"); // Si venimos desde la página de carritos
  const customerId = searchParams.get("customerId"); // Recuperar el ID del cliente seleccionado
  
  // Estado para cargando y error
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estado para datos de organización y sucursal
  const [orgData, setOrgData] = useState<any>(null);
  
  // Métodos de pago disponibles
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { id: 1, name: "Efectivo", supportsParcial: true },
    { id: 2, name: "Tarjeta de Crédito" },
    { id: 3, name: "Tarjeta de Débito" },
    { id: 4, name: "Transferencia" },
    { id: 5, name: "Monedero Electrónico" },
    { id: 6, name: "A cuenta", supportsParcial: true },
  ]);

  // Datos del carrito
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Datos de cliente
  const [customer, setCustomer] = useState({
    id: 0,
    name: "Cliente General",
    email: "",
    phone: "",
  });

  // Estado para el método de pago seleccionado
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  
  // Estado para pagos realizados
  const [payments, setPayments] = useState<Payment[]>([]);
  
  // Estado para monto de pago actual
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  
  // Calcular totales
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.16;
  const total = subtotal + tax;
  
  // Calcular total pagado y pendiente
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const pendingAmount = total - totalPaid;
  
  // Función para agregar un pago
  const addPayment = () => {
    if (!selectedMethod) return;
    
    const amount = parseFloat(currentPaymentAmount) || 
      (selectedMethod.supportsParcial ? 0 : pendingAmount);
    
    if (amount <= 0 || amount > pendingAmount) return;
    
    const newPayment: Payment = {
      id: Date.now(),
      methodId: selectedMethod.id,
      methodName: selectedMethod.name,
      amount: amount,
      reference: reference.trim() || undefined
    };
    
    setPayments([...payments, newPayment]);
    setCurrentPaymentAmount("");
    setReference("");
  };

  // Función para eliminar un pago
  const removePayment = (paymentId: number) => {
    setPayments(payments.filter(payment => payment.id !== paymentId));
  };

  // Función para cargar detalles completos del cliente desde la base de datos
  const loadCustomerDetails = async (customerId: string | number) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
        
      if (error) {
        console.error('Error al cargar detalles del cliente:', error);
        return;
      }
      
      if (data) {
        setCustomer(data);
      }
    } catch (err) {
      console.error('Error al cargar detalles del cliente:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Cargar datos del carrito desde localStorage o desde Supabase si hay cartId
  useEffect(() => {
    const loadCartData = async () => {
      try {
        setLoading(true);
        
        // Obtener la sesión actual
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setError("No se pudo obtener la sesión del usuario");
          setLoading(false);
          return;
        }
        
        // Obtener datos de organización
        const userData = await getUserOrganization(session.user.id);
        
        if (userData.error || !userData.organization) {
          setError("No se pudo obtener la información de la organización");
          setLoading(false);
          return;
        }
        
        // Obtener la sucursal seleccionada por el usuario
        const currentBranchId = localStorage.getItem('currentBranchId');
        if (!currentBranchId) {
          setError("No se ha seleccionado una sucursal");
          setLoading(false);
          return;
        }
        
        const { data: branchData, error: branchError } = await supabase
          .from("branches")
          .select("*")
          .eq("id", currentBranchId)
          .single();
          
        if (branchError) {
          setError("No se pudo obtener la información de la sucursal");
          setLoading(false);
          return;
        }
        
        // Guardar información de organización y sucursal
        setOrgData({
          organization_id: userData.organization.id,
          branch_id: branchData.id,
          user_id: session.user.id
        });
        
        // Si tenemos cartId, cargar desde Supabase
        if (cartId) {
          const { data: cartData, error: cartError } = await supabase
            .from("carts")
            .select("*")
            .eq("id", cartId)
            .eq("organization_id", userData.organization.id)
            .single();
            
          if (cartError) {
            setError("No se pudo cargar el carrito guardado");
            setLoading(false);
            return;
          }
          
          // Parsear los datos del carrito de JSON
          const parsedCartData = JSON.parse(cartData.cart_data);
          
          if (parsedCartData.items && Array.isArray(parsedCartData.items)) {
            setCartItems(parsedCartData.items);
          }
          
          if (parsedCartData.customer) {
            setCustomer(parsedCartData.customer);
          }
        } else {
          // Cargar desde localStorage con verificación de expiración
          const savedCart = localStorage.getItem("posCart");
          
          if (savedCart) {
            try {
              const parsedCart = JSON.parse(savedCart);
              
              // Verificar si el carrito ha expirado
              if (parsedCart.expiresAt) {
                const expiryDate = new Date(parsedCart.expiresAt);
                if (expiryDate < new Date()) {
                  console.log("El carrito ha expirado, eliminando datos");
                  localStorage.removeItem("posCart");
                  return; // No cargar datos expirados
                }
              }
              
              if (parsedCart.items && Array.isArray(parsedCart.items)) {
                setCartItems(parsedCart.items);
              }
              
              // Manejar datos sanitizados del cliente
              if (parsedCart.customer) {
                // Si necesitamos datos completos del cliente, los cargamos desde la base de datos
                if (parsedCart.customer.id) {
                  // Cargar datos completos del cliente desde la base de datos
                  loadCustomerDetails(parsedCart.customer.id);
                } else {
                  // Usar datos sanitizados si no hay ID
                  setCustomer(parsedCart.customer);
                }
              }
            } catch (err) {
              console.error("Error al parsear el carrito del localStorage:", err);
              // Eliminar datos corruptos
              localStorage.removeItem("posCart");
            }
          }
        }
        
        // Si tenemos customerId, cargar datos del cliente desde Supabase
        if (customerId) {
          try {
            const { data: customerData, error: customerError } = await supabase
              .from("customers")
              .select("*")
              .eq("id", customerId)
              .eq("organization_id", userData.organization.id)
              .single();
              
            if (customerError) {
              console.error("Error al cargar datos del cliente:", customerError);
            } else if (customerData) {
              // Si ya tenemos cliente asignado desde el carrito, solo actualizarlo si coincide el ID
              if (!customer.id || customer.id.toString() === customerId) {
                setCustomer({
                  id: customerData.id,
                  name: customerData.full_name || `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim(),
                  email: customerData.email || "",
                  phone: customerData.phone || ""
                });
              }
            }
          } catch (customerErr) {
            console.error("Error al procesar datos del cliente:", customerErr);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar datos");
        setLoading(false);
      }
    };
    
    loadCartData();
  }, [cartId, customerId]);
  
  // Función para completar la venta
  const completeSale = async () => {
    if (cartItems.length === 0 || pendingAmount > 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      if (!orgData) {
        throw new Error('No se pudo obtener información de la organización');
      }
      
      // 1. Crear registro de venta (sales)
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          organization_id: orgData.organization_id,
          branch_id: orgData.branch_id,
          customer_id: customer.id || null, // Si es cliente general, puede ser null
          user_id: orgData.user_id,
          total: total,
          balance: pendingAmount > 0 ? pendingAmount : 0,
          subtotal: subtotal,
          tax: tax,
          discount: 0, // Campo para descuentos si se implementa después
          notes: JSON.stringify({
            source: mesaId ? `mesa_${mesaId}` : (cartId ? `carrito_${cartId}` : 'directo'),
            customer_info: customer
          }),
          status: pendingAmount > 0 ? 'partial' : 'paid',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (saleError) {
        throw new Error(`Error al crear la venta: ${saleError.message}`);
      }
      
      // 2. Crear items de venta (sale_items)
      const saleItems = cartItems.map(item => ({
        sale_id: saleData.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        total: item.price * item.quantity,
        tax_amount: (item.price * item.quantity) * 0.16, // Calculando el IVA por ítem
        tax_rate: 16, // Porcentaje de IVA
        discount_amount: 0, // Para implementar descuentos por ítem después
        notes: JSON.stringify({
          product_name: item.name // Guardar el nombre para referencia histórica
        })
      }));
      
      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);
      
      if (itemsError) {
        throw new Error(`Error al guardar los productos: ${itemsError.message}`);
      }
      
      // 3. Registrar pagos (payments)
      if (payments.length > 0) {
        const paymentRecords = payments.map(payment => ({
          organization_id: orgData.organization_id,
          branch_id: orgData.branch_id,
          source: 'sale',
          source_id: saleData.id,
          method: paymentMethods.find(m => m.id === payment.methodId)?.name || payment.methodName,
          amount: payment.amount,
          reference: payment.reference || null,
          processor_response: null, // Para pagos con procesadores de pago
          status: 'completed',
          created_at: new Date().toISOString(),
          user_id: orgData.user_id
        }));
        
        const { error: paymentsError } = await supabase
          .from('payments')
          .insert(paymentRecords);
        
        if (paymentsError) {
          throw new Error(`Error al registrar los pagos: ${paymentsError.message}`);
        }
      }
      
      // 4. Si hay balance pendiente, crear cuenta por cobrar (accounts_receivable)
      if (pendingAmount > 0) {
        const { error: accountError } = await supabase
          .from('accounts_receivable')
          .insert({
            customer_id: customer.id,
            organization_id: orgData.organization_id,
            branch_id: orgData.branch_id,
            sale_id: saleData.id,
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 días después
            amount: total, // Monto total de la venta
            balance: pendingAmount, // Monto pendiente
            status: "current",
            created_at: new Date().toISOString(),
            notes: JSON.stringify({
              sale_reference: `Venta #${saleData.id}`,
              origin: mesaId ? `Mesa ${mesaId}` : 'Venta directa'
            })
          });
        
        if (accountError) {
          console.error("Error al crear cuenta por cobrar:", accountError);
          // No bloqueamos la venta si falla esto
        }
      }
      
      // 5. Si venía de una mesa, actualizar su estado y cerrar la sesión de mesa
      if (mesaId) {
        // Buscar la sesión activa de la mesa
        const { data: sessionData } = await supabase
          .from("table_sessions")
          .select("*")
          .eq("restaurant_table_id", mesaId)
          .eq("status", "active")
          .single();
          
        if (sessionData) {
          // Actualizar la sesión con el ID de venta y marcarla como completada
          await supabase
            .from("table_sessions")
            .update({
              sale_id: saleData.id,
              closed_at: new Date().toISOString(),
              status: "completed"
            })
            .eq("id", sessionData.id);
            
          // Actualizar la mesa a estado libre
          await supabase
            .from("restaurant_tables")
            .update({ state: "free" })
            .eq("id", mesaId);
        }
      }
      
      // 6. Si venía de un carrito guardado, eliminarlo
      if (cartId) {
        await supabase
          .from("carts")
          .delete()
          .eq("id", cartId);
      }
      
      // 7. Limpiar localStorage
      localStorage.removeItem("posCart");
      
      // 8. Mostrar mensaje de éxito y redireccionar
      alert(`Venta #${saleData.id} completada con éxito`);
      router.push("/app/pos");
      
    } catch (err) {
      console.error("Error al completar la venta:", err);
      setError(`Error al procesar la venta: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return amount.toFixed(2);
  };

  // Generar opciones de pago rápido
  const getQuickAmounts = () => {
    if (pendingAmount <= 0) return [];
    
    const amounts = [
      Math.ceil(pendingAmount / 100) * 100, // Redondear al 100 más cercano
      Math.ceil(pendingAmount / 50) * 50,   // Redondear al 50 más cercano
      Math.ceil(pendingAmount / 20) * 20,   // Redondear al 20 más cercano
      pendingAmount                         // Monto exacto
    ];
    
    return Array.from(new Set(amounts)).sort((a, b) => a - b);
  };

  // Verificar si se puede completar la venta
  const canCompleteSale = pendingAmount <= 0;

  return (
    <div className="container mx-auto p-4">
      {/* Mensajes de carga y error */}
      {loading && (
        <div className="bg-blue-100 p-4 mb-4 rounded text-center">
          <p>Cargando datos...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 p-4 mb-4 rounded text-center">
          <p className="text-red-700">{error}</p>
          <Button 
            variant="outline" 
            size="sm"
            className="mt-2"
            onClick={() => setError(null)}
          >
            Cerrar
          </Button>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href={mesaId ? `/app/pos/mesa/${mesaId}` : "/app/pos"}>
            <Button variant="outline" size="sm" className="mb-2">
              ← Volver{mesaId ? ` a Mesa ${mesaId}` : ""}
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Cobro de Venta</h1>
          <p className="text-gray-600">Cliente: {customer.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel Izquierdo - Resumen y Pagos */}
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cartItems.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    No hay productos en el carrito
                  </div>
                ) : (
                  cartItems.map(item => (
                    <div key={item.id} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-sm text-gray-500">
                          {item.quantity} x ${formatCurrency(item.price)}
                        </div>
                      </div>
                      <div className="text-right font-medium">
                        ${formatCurrency(item.quantity * item.price)}
                      </div>
                    </div>
                  ))
                )}
                
                <div className="pt-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>${formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>IVA (16%):</span>
                    <span>${formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg mt-2">
                    <span>Total:</span>
                    <span>${formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Pagos Realizados</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-center text-gray-500 py-4">
                  No hay pagos registrados
                </p>
              ) : (
                <div className="space-y-3">
                  {payments.map(payment => (
                    <div key={payment.id} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <div className="font-medium">{payment.methodName}</div>
                        {payment.reference && (
                          <div className="text-sm text-gray-500">
                            Ref: {payment.reference}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="font-medium">${formatCurrency(payment.amount)}</span>
                        <Button 
                          size="sm"
                          variant="outline"
                          onClick={() => removePayment(payment.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-2">
                    <div className="flex justify-between">
                      <span>Total pagado:</span>
                      <span>${formatCurrency(totalPaid)}</span>
                    </div>
                    <div className="flex justify-between font-bold mt-1">
                      <span>Pendiente:</span>
                      <span className={pendingAmount > 0 ? "text-red-600" : "text-green-600"}>
                        ${formatCurrency(pendingAmount)}
                      </span>
                    </div>
                    {pendingAmount < 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Cambio:</span>
                        <span>${formatCurrency(Math.abs(pendingAmount))}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-center">
            <Button 
              size="lg"
              disabled={!canCompleteSale}
              onClick={completeSale}
              className="w-full max-w-md"
            >
              {canCompleteSale ? "Completar Venta" : "Falta Pago"}
            </Button>
            <div className="mt-2 text-sm text-gray-500">
              {canCompleteSale 
                ? "Venta lista para ser procesada" 
                : `Falta pagar: $${formatCurrency(pendingAmount)}`}
            </div>
          </div>
        </div>

        {/* Panel Derecho - Métodos de Pago */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>
                Método de Pago
                {selectedMethod && ` - ${selectedMethod.name}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedMethod ? (
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map(method => (
                    <Button
                      key={method.id}
                      variant="outline"
                      className="h-20 flex flex-col"
                      onClick={() => setSelectedMethod(method)}
                    >
                      <span className="text-lg">{method.name}</span>
                      {method.supportsParcial && (
                        <span className="text-xs mt-1">Permite pago parcial</span>
                      )}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Monto a Pagar
                    </label>
                    <Input
                      type="number"
                      placeholder={`Monto (máximo $${formatCurrency(pendingAmount)})`}
                      value={currentPaymentAmount}
                      onChange={(e) => setCurrentPaymentAmount(e.target.value)}
                      disabled={pendingAmount <= 0}
                    />
                  </div>
                  
                  {/* Botones de pago rápido */}
                  {selectedMethod.supportsParcial && (
                    <div className="flex flex-wrap gap-2">
                      {getQuickAmounts().map((amount) => (
                        <Button
                          key={amount}
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPaymentAmount(amount.toString())}
                        >
                          ${formatCurrency(amount)}
                        </Button>
                      ))}
                    </div>
                  )}
                  
                  {/* Campo de referencia para algunos métodos */}
                  {selectedMethod.id !== 1 && (
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Referencia / Autorización
                      </label>
                      <Input
                        type="text"
                        placeholder={`Referencia de ${selectedMethod.name}`}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                      />
                    </div>
                  )}
                  
                  <div className="flex gap-3 mt-4">
                    <Button 
                      variant="outline"
                      className="flex-1"
                      onClick={() => setSelectedMethod(null)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={addPayment}
                      disabled={pendingAmount <= 0}
                    >
                      Aplicar Pago
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Opciones Adicionales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline">
                    Añadir Descuento
                  </Button>
                  <Button variant="outline">
                    Imprimir Recibo
                  </Button>
                  <Button variant="outline">
                    Cambiar Cliente
                  </Button>
                  <Button variant="outline">
                    Guardar Pendiente
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
