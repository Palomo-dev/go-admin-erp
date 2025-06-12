'use client'

import { useEffect, useState } from 'react'
import { supabase, getUserOrganization } from '@/lib/supabase/config'
import { User } from '@supabase/supabase-js'

// Componentes UI
import { Button } from '@/components/pos/button'
import { Badge } from '@/components/pos/badge'
import { Card } from '@/components/pos/card'
import { Input } from '@/components/pos/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/pos/tabs'

// Tipos
interface AccountsReceivable {
  id: string
  customer_id: string
  customer: Customer
  amount: number
  balance: number
  due_date: string
  status: string
  days_overdue: number
  created_at: string
  last_reminder_date?: string
  sale_id?: string
}

interface Customer {
  id: string
  full_name: string
  email?: string
  phone?: string
  identification_number?: string
}

interface Payment {
  id: string
  source: string
  source_id: string
  method: string
  amount: number
  reference?: string
  created_at: string
}

// Componente principal
export default function CuentasPorCobrarPage() {
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<AccountsReceivable[]>([])
  const [filteredAccounts, setFilteredAccounts] = useState<AccountsReceivable[]>([])
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<AccountsReceivable | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)

  // Obtener usuario y cargar datos iniciales
  useEffect(() => {
    // Obtener la sesión del usuario
    const getUser = async () => {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser()
        
        if (error) {
          console.error('Error al obtener usuario:', error)
          return
        }
        
        if (authUser) {
          setUser(authUser)
          loadAccounts(authUser.id)
        }
      } catch (error) {
        console.error('Error en autenticación:', error)
      }
    }
    
    getUser()
  }, [])

  // Aplicar filtros cuando cambien
  useEffect(() => {
    if (accounts.length > 0) {
      let filtered = [...accounts]

      // Filtro por texto
      if (filter) {
        filtered = filtered.filter(account => 
          account.customer.full_name.toLowerCase().includes(filter.toLowerCase()) ||
          (account.customer.email && account.customer.email.toLowerCase().includes(filter.toLowerCase())) ||
          (account.customer.identification_number && account.customer.identification_number.includes(filter))
        )
      }

      // Filtro por estado
      if (statusFilter !== 'all') {
        filtered = filtered.filter(account => {
          if (statusFilter === 'current') {
            return account.status === 'current'
          } else if (statusFilter === 'overdue') {
            return account.status === 'overdue'
          }
          return true
        })
      }

      setFilteredAccounts(filtered)
    }
  }, [filter, statusFilter, accounts])

  // Función para cargar las cuentas por cobrar
  async function loadAccounts(userId: string) {
    try {
      setLoading(true)
      setError(null)

      // Obtener la organización del usuario
      const orgData = await getUserOrganization(userId)

      if (!orgData.organization) {
        setError('No se pudo obtener la organización del usuario')
        setLoading(false)
        return
      }

      // Guardar IDs para uso posterior
      setOrganizationId(orgData.organization.id)
      setBranchId(orgData.branch_id)

      // Consultar cuentas por cobrar con información de clientes
      const { data, error: accountsError } = await supabase
        .from('accounts_receivable')
        .select(`
          id, 
          amount, 
          balance, 
          due_date, 
          status, 
          days_overdue, 
          created_at, 
          last_reminder_date,
          sale_id,
          customer_id,
          customers (
            id, 
            full_name, 
            email, 
            phone, 
            identification_number
          )
        `)
        .eq('organization_id', orgData.organization.id)

      if (accountsError) {
        console.error('Error al cargar cuentas por cobrar:', accountsError)
        setError('Error al cargar las cuentas por cobrar')
        setLoading(false)
        return
      }

      // Transformar datos para incluir la información del cliente
      const formattedAccounts = data.map((account: any) => ({
        ...account,
        customer: account.customers
      }))

      setAccounts(formattedAccounts)
      setFilteredAccounts(formattedAccounts)
    } catch (error) {
      console.error('Error general al cargar cuentas por cobrar:', error)
      setError('Error al cargar las cuentas por cobrar')
    } finally {
      setLoading(false)
    }
  }

  // Función para registrar un pago
  async function registerPayment() {
    if (!selectedAccount || !paymentAmount || !paymentMethod || !organizationId || !branchId || !user) {
      return
    }

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('El monto del pago debe ser mayor a cero')
      return
    }

    if (amount > selectedAccount.balance) {
      setError('El monto del pago no puede ser mayor al saldo pendiente')
      return
    }

    try {
      setPaymentLoading(true)
      setError(null)

      // 1. Registrar el pago en la tabla payments
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          source: 'accounts_receivable',
          source_id: selectedAccount.id,
          method: paymentMethod,
          amount: amount,
          reference: paymentReference || null,
          status: 'completed',
          created_by: user.id
        })
        .select()

      if (paymentError) {
        console.error('Error al registrar pago:', paymentError)
        setError('Error al registrar el pago')
        setPaymentLoading(false)
        return
      }

      // 2. Actualizar el saldo en accounts_receivable
      const newBalance = selectedAccount.balance - amount
      const newStatus = newBalance <= 0 ? 'paid' : 'partial'

      const { error: updateError } = await supabase
        .from('accounts_receivable')
        .update({
          balance: newBalance,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedAccount.id)

      if (updateError) {
        console.error('Error al actualizar cuenta por cobrar:', updateError)
        setError('Error al actualizar el saldo de la cuenta')
        setPaymentLoading(false)
        return
      }

      // 3. Recargar las cuentas
      await loadAccounts(user.id)

      // 4. Limpiar el formulario
      setPaymentSuccess(true)
      setTimeout(() => {
        setPaymentSuccess(false)
        setShowPaymentForm(false)
        setSelectedAccount(null)
        setPaymentAmount('')
        setPaymentMethod('cash')
        setPaymentReference('')
      }, 2000)

    } catch (error) {
      console.error('Error general al registrar pago:', error)
      setError('Error al procesar el pago')
    } finally {
      setPaymentLoading(false)
    }
  }

  // Exportar a CSV
  function exportToCSV() {
    if (!filteredAccounts.length) return

    const headers = [
      'Cliente', 'Monto Total', 'Saldo', 'Fecha Vencimiento', 
      'Estado', 'Días Vencidos', 'Fecha Creación', 'Email', 'Teléfono'
    ]

    const csvData = filteredAccounts.map(account => [
      account.customer.full_name,
      account.amount,
      account.balance,
      new Date(account.due_date).toLocaleDateString(),
      account.status === 'current' ? 'Al día' : account.status === 'overdue' ? 'Vencida' : 'Pagada',
      account.days_overdue || 0,
      new Date(account.created_at).toLocaleDateString(),
      account.customer.email || '',
      account.customer.phone || ''
    ])

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `cuentas-por-cobrar-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Calcular aging para cada categoría
  const agingGroups = {
    current: filteredAccounts.filter(account => account.status === 'current').length,
    overdue30: filteredAccounts.filter(account => account.status === 'overdue' && account.days_overdue <= 30).length,
    overdue60: filteredAccounts.filter(account => account.status === 'overdue' && account.days_overdue > 30 && account.days_overdue <= 60).length,
    overdue90: filteredAccounts.filter(account => account.status === 'overdue' && account.days_overdue > 60 && account.days_overdue <= 90).length,
    overdue90Plus: filteredAccounts.filter(account => account.status === 'overdue' && account.days_overdue > 90).length
  }

  // Calcular totales para estadísticas
  const totalAccounts = filteredAccounts.length
  const totalBalance = filteredAccounts.reduce((sum, account) => sum + account.balance, 0)
  const overdueAmount = filteredAccounts
    .filter(account => account.status === 'overdue')
    .reduce((sum, account) => sum + account.balance, 0)

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Crédito a Clientes (CxC)</h1>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          {error}
        </div>
      )}

      {paymentSuccess && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">
          Pago registrado correctamente
        </div>
      )}

      {/* Dashboard de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Total Cuentas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalAccounts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Total por Cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${totalBalance.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Vencidas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${overdueAmount.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Acciones</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={exportToCSV} disabled={filteredAccounts.length === 0}>
              Exportar CSV
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Análisis de Aging */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Aging de Deudas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center">
              <h3 className="font-medium">Al día</h3>
              <p className="text-xl mt-2">{agingGroups.current}</p>
            </div>
            <div className="text-center">
              <h3 className="font-medium">1-30 días</h3>
              <p className="text-xl mt-2">{agingGroups.overdue30}</p>
            </div>
            <div className="text-center">
              <h3 className="font-medium">31-60 días</h3>
              <p className="text-xl mt-2">{agingGroups.overdue60}</p>
            </div>
            <div className="text-center">
              <h3 className="font-medium">61-90 días</h3>
              <p className="text-xl mt-2">{agingGroups.overdue90}</p>
            </div>
            <div className="text-center">
              <h3 className="font-medium">+90 días</h3>
              <p className="text-xl mt-2">{agingGroups.overdue90Plus}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="w-full md:w-1/3">
          <Input
            type="text"
            placeholder="Buscar cliente..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="w-full md:w-1/3">
          <select
            className="w-full px-4 py-2 border rounded-md"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="current">Al día</option>
            <option value="overdue">Vencidos</option>
          </select>
        </div>
      </div>

      {/* Tabla de cuentas por cobrar */}
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <svg className="animate-spin h-8 w-8 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-3 text-left">Cliente</th>
                <th className="p-3 text-left">Monto</th>
                <th className="p-3 text-left">Saldo</th>
                <th className="p-3 text-left">Vencimiento</th>
                <th className="p-3 text-left">Estado</th>
                <th className="p-3 text-left">Días Vencido</th>
                <th className="p-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-gray-500">
                    No se encontraron cuentas por cobrar
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((account) => (
                  <tr key={account.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-medium">{account.customer.full_name}</div>
                      <div className="text-sm text-gray-500">{account.customer.email}</div>
                    </td>
                    <td className="p-3">${account.amount.toFixed(2)}</td>
                    <td className="p-3">${account.balance.toFixed(2)}</td>
                    <td className="p-3">{new Date(account.due_date).toLocaleDateString()}</td>
                    <td className="p-3">
                      <Badge 
                        className={account.status === 'current' ? 'bg-green-100 text-green-800' : 
                          account.status === 'overdue' ? 'bg-red-100 text-red-800' : 
                          'bg-gray-100 text-gray-800'}
                      >
                        {account.status === 'current' ? 'Al día' : 
                         account.status === 'overdue' ? 'Vencido' : 
                         account.status === 'partial' ? 'Parcial' : 
                         account.status === 'paid' ? 'Pagado' : account.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {account.days_overdue > 0 && (
                        <span className="text-red-600">{account.days_overdue} días</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Button 
                        onClick={() => {
                          setSelectedAccount(account)
                          setShowPaymentForm(true)
                          setPaymentAmount(account.balance.toString())
                        }}
                        disabled={account.balance <= 0}
                      >
                        Registrar Pago
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Pago */}
      {showPaymentForm && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Registrar Pago</h2>
            <div className="mb-4">
              <p>
                <span className="font-medium">Cliente:</span> {selectedAccount.customer.full_name}
              </p>
              <p>
                <span className="font-medium">Saldo pendiente:</span> ${selectedAccount.balance.toFixed(2)}
              </p>
            </div>
            <div className="mb-4">
              <label className="block mb-2">Monto a pagar</label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Monto"
                max={selectedAccount.balance}
                min={0.01}
                step="0.01"
              />
            </div>
            <div className="mb-4">
              <label className="block mb-2">Método de pago</label>
              <select
                className="w-full px-3 py-2 border rounded-md"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
                <option value="check">Cheque</option>
              </select>
            </div>
            <div className="mb-6">
              <label className="block mb-2">Referencia (opcional)</label>
              <Input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Número de autorización, cheque, etc."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowPaymentForm(false)
                  setSelectedAccount(null)
                  setPaymentAmount('')
                  setPaymentMethod('cash')
                  setPaymentReference('')
                }}
                className="bg-gray-200 text-gray-800 hover:bg-gray-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={registerPayment}
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || parseFloat(paymentAmount) > selectedAccount.balance || paymentLoading}
              >
                {paymentLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Procesando...
                  </>
                ) : (
                  'Registrar Pago'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
