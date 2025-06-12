"use client";

import { useEffect, useState } from "react";
import { supabase, getUserOrganization } from "@/lib/supabase/config";
import { Button } from "@/components/pos/button";

export default function CajasPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCashSession, setActiveCashSession] = useState<any>(null);
  const [cashMovements, setCashMovements] = useState<any[]>([]);
  const [newMovement, setNewMovement] = useState({
    type: "in",
    amount: "",
    concept: "",
    notes: ""
  });
  const [initialAmount, setInitialAmount] = useState("");
  const [finalAmount, setFinalAmount] = useState("");
  const [summary, setSummary] = useState({
    totalIn: 0,
    totalOut: 0,
    balance: 0,
    expectedBalance: 0,
    difference: 0
  });

  // Usamos la instancia centralizada de supabase importada del config

  useEffect(() => {
    loadCashSessionData();
  }, []);

  const loadCashSessionData = async () => {
    try {
      setLoading(true);
      
      // Obtener sesión de usuario
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No hay sesión activa");
      }

      // Obtener organización y sucursal del usuario
      const userOrgData = await getUserOrganization(session.user.id);
      if (!userOrgData || !userOrgData.organization) {
        throw new Error("No se pudo obtener la organización del usuario");
      }
      
      const organizationId = userOrgData.organization.id;
      const branchId = userOrgData.organization.branch_id;
      
      // Verificar que tenemos IDs válidos
      if (!organizationId || typeof organizationId !== 'number') {
        throw new Error("ID de organización inválido o no disponible");
      }
      
      if (!branchId || typeof branchId !== 'number') {
        throw new Error("ID de sucursal inválido o no disponible");
      }
      
      // Obtener sesión de caja activa
      const { data: cashSessionData, error: cashSessionError } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("branch_id", branchId)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();
      
      if (cashSessionError) {
        throw new Error(`Error al consultar sesiones de caja: ${cashSessionError.message}`);
      }
      
      setActiveCashSession(cashSessionData);
      
      // Si hay una sesión activa, cargar sus movimientos
      if (cashSessionData) {
        const { data: movementsData, error: movementsError } = await supabase
          .from("cash_movements")
          .select("*")
          .eq("cash_session_id", cashSessionData.id)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false });
        
        if (movementsError) {
          throw new Error(`Error al consultar movimientos de caja: ${movementsError.message}`);
        }
        
        setCashMovements(movementsData || []);
        calculateSummary(cashSessionData, movementsData || []);
      }
      
      setError(null);
    } catch (err: any) {
      const errorMessage = err.message || 'Error desconocido al cargar datos de caja';
      setError(errorMessage);
      console.error("Error al cargar datos de caja:", errorMessage, err);
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (session: any, movements: any[]) => {
    const totalIn = movements
      .filter(m => m.type === "in")
      .reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
    
    const totalOut = movements
      .filter(m => m.type === "out")
      .reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
    
    const initialAmt = parseFloat(session?.initial_amount || 0);
    const expectedBalance = initialAmt + totalIn - totalOut;
    
    setSummary({
      totalIn,
      totalOut,
      balance: initialAmt,
      expectedBalance,
      difference: 0 // Se calculará al cierre
    });
  };

  const handleOpenCashSession = async () => {
    try {
      setLoading(true);
      
      if (!initialAmount || parseFloat(initialAmount) < 0) {
        throw new Error("El monto inicial debe ser un número positivo");
      }
      
      // Obtener sesión de usuario
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No hay sesión activa");
      }

      // Obtener organización y sucursal del usuario
      const userOrgData = await getUserOrganization(session.user.id);
      if (!userOrgData || !userOrgData.organization) {
        throw new Error("No se pudo obtener la organización del usuario");
      }
      
      const organizationId = userOrgData.organization.id;
      const branchId = userOrgData.organization.branch_id;
      
      // Crear nueva sesión de caja
      const { data: newSession, error: createError } = await supabase
        .from("cash_sessions")
        .insert([
          {
            organization_id: organizationId,
            branch_id: branchId,
            opened_by: session.user.id,
            opened_at: new Date().toISOString(),
            initial_amount: parseFloat(initialAmount),
            status: "open",
            notes: "Apertura de caja"
          }
        ])
        .select()
        .single();
      
      if (createError) {
        throw new Error(`Error al abrir caja: ${createError.message}`);
      }
      
      setActiveCashSession(newSession);
      setCashMovements([]);
      calculateSummary(newSession, []);
      setError(null);
      
    } catch (err: any) {
      setError(err.message);
      console.error("Error al abrir caja:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCashSession = async () => {
    try {
      setLoading(true);
      
      if (!finalAmount || isNaN(parseFloat(finalAmount))) {
        throw new Error("El monto final debe ser un número válido");
      }
      
      // Obtener sesión de usuario
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No hay sesión activa");
      }

      if (!activeCashSession) {
        throw new Error("No hay una sesión de caja activa para cerrar");
      }
      
      const finalAmountNum = parseFloat(finalAmount);
      const difference = finalAmountNum - summary.expectedBalance;
      
      // Actualizar sesión de caja
      const { error: updateError } = await supabase
        .from("cash_sessions")
        .update({
          closed_by: session.user.id,
          closed_at: new Date().toISOString(),
          final_amount: finalAmountNum,
          difference: difference,
          status: "closed"
        })
        .eq("id", activeCashSession.id);
      
      if (updateError) {
        throw new Error(`Error al cerrar caja: ${updateError.message}`);
      }
      
      // Recargar datos
      await loadCashSessionData();
      setFinalAmount("");
      
    } catch (err: any) {
      setError(err.message);
      console.error("Error al cerrar caja:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCashMovement = async () => {
    try {
      if (!activeCashSession) {
        throw new Error("No hay una sesión de caja activa");
      }
      
      if (!newMovement.concept || !newMovement.amount || parseFloat(newMovement.amount) <= 0) {
        throw new Error("El concepto y monto son obligatorios. El monto debe ser positivo.");
      }
      
      // Obtener sesión de usuario
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No hay sesión activa");
      }

      // Crear movimiento de caja
      const { data: movement, error: movementError } = await supabase
        .from("cash_movements")
        .insert([
          {
            organization_id: activeCashSession.organization_id,
            cash_session_id: activeCashSession.id,
            type: newMovement.type,
            concept: newMovement.concept,
            amount: parseFloat(newMovement.amount),
            notes: newMovement.notes || null,
            user_id: session.user.id
          }
        ])
        .select()
        .single();
      
      if (movementError) {
        throw new Error(`Error al registrar movimiento: ${movementError.message}`);
      }
      
      // Resetear formulario y recargar datos
      setNewMovement({
        type: "in",
        amount: "",
        concept: "",
        notes: ""
      });
      
      await loadCashSessionData();
      
    } catch (err: any) {
      setError(err.message);
      console.error("Error al agregar movimiento:", err);
    }
  };

  if (loading && !activeCashSession) {
    return <div className="p-8">Cargando datos de caja...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestión de Caja</h1>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}

      {!activeCashSession ? (
        <div className="bg-white p-4 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Apertura de Caja</h2>
          <div className="mb-4">
            <label className="block mb-2">Monto Inicial ($):</label>
            <input
              type="number"
              className="border rounded p-2 w-full"
              value={initialAmount}
              onChange={(e) => setInitialAmount(e.target.value)}
              min="0"
              step="0.01"
            />
          </div>
          <Button 
            onClick={handleOpenCashSession}
            disabled={loading}
            className="bg-blue-600 text-white"
          >
            {loading ? "Procesando..." : "Abrir Caja"}
          </Button>
        </div>
      ) : activeCashSession.status === "open" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Sesión de Caja Activa</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">ID de Sesión:</p>
                  <p>{activeCashSession.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Apertura:</p>
                  <p>{new Date(activeCashSession.opened_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Monto Inicial:</p>
                  <p className="font-semibold">${parseFloat(activeCashSession.initial_amount).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Balance Esperado:</p>
                  <p className="font-semibold">${summary.expectedBalance.toFixed(2)}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Nuevo Movimiento de Caja</h2>
              <div className="space-y-3">
                <div>
                  <label className="block mb-1">Tipo:</label>
                  <select
                    className="border rounded p-2 w-full"
                    value={newMovement.type}
                    onChange={(e) => setNewMovement({...newMovement, type: e.target.value})}
                  >
                    <option value="in">Entrada</option>
                    <option value="out">Salida</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Concepto:</label>
                  <input
                    type="text"
                    className="border rounded p-2 w-full"
                    value={newMovement.concept}
                    onChange={(e) => setNewMovement({...newMovement, concept: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block mb-1">Monto ($):</label>
                  <input
                    type="number"
                    className="border rounded p-2 w-full"
                    value={newMovement.amount}
                    onChange={(e) => setNewMovement({...newMovement, amount: e.target.value})}
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block mb-1">Notas:</label>
                  <textarea
                    className="border rounded p-2 w-full"
                    value={newMovement.notes}
                    onChange={(e) => setNewMovement({...newMovement, notes: e.target.value})}
                    rows={2}
                  />
                </div>
                <Button 
                  onClick={handleAddCashMovement}
                  disabled={loading}
                  className="w-full bg-green-600 text-white"
                >
                  {newMovement.type === "in" ? "Registrar Entrada" : "Registrar Salida"}
                </Button>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Cerrar Caja</h2>
              <div className="mb-4">
                <label className="block mb-1">Monto Final en Caja ($):</label>
                <input
                  type="number"
                  className="border rounded p-2 w-full"
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <Button 
                onClick={handleCloseCashSession}
                disabled={loading}
                className="w-full bg-red-600 text-white"
              >
                Cerrar Caja
              </Button>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow-md h-fit">
            <h2 className="text-xl font-semibold mb-4">Movimientos</h2>
            <div className="mb-2 flex justify-between text-gray-600 text-sm">
              <p>Entradas: <span className="font-semibold text-green-600">${summary.totalIn.toFixed(2)}</span></p>
              <p>Salidas: <span className="font-semibold text-red-600">${summary.totalOut.toFixed(2)}</span></p>
            </div>
            {cashMovements.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No hay movimientos registrados</p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {cashMovements.map((movement) => (
                  <div 
                    key={movement.id} 
                    className={`p-2 border-l-4 ${movement.type === "in" ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"} rounded shadow-sm`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-medium">{movement.concept}</span>
                      <span className={`font-bold ${movement.type === "in" ? "text-green-600" : "text-red-600"}`}>
                        {movement.type === "in" ? "+" : "-"}${parseFloat(movement.amount).toFixed(2)}
                      </span>
                    </div>
                    {movement.notes && (
                      <p className="text-sm text-gray-600 mt-1">{movement.notes}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(movement.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">La caja está cerrada</h2>
          <p>La última sesión de caja fue cerrada el {new Date(activeCashSession.closed_at).toLocaleString()}</p>
          <div className="mt-4">
            <Button 
              onClick={() => setActiveCashSession(null)} 
              className="bg-blue-600 text-white"
            >
              Iniciar Nueva Sesión
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
