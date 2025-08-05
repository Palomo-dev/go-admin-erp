/**
 * Diálogo de ayuda para entender cómo crear payloads de eventos personalizados
 */

'use client';

import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  HelpCircle, 
  Copy, 
  Code,
  Database,
  Users,
  ShoppingCart,
  DollarSign,
  Package,
  Calendar,
  Building
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface PayloadHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPayload: (payload: string) => void;
  currentModule: string;
}

// Definición de campos comunes con descripción
const COMMON_FIELDS = {
  evento_id: {
    type: 'string',
    description: 'Identificador único del evento (UUID)',
    required: true,
    example: '"uuid-evento-12345"'
  },
  timestamp: {
    type: 'string',
    description: 'Fecha y hora cuando ocurrió el evento (ISO 8601)',
    required: true,
    example: '"2025-01-31T10:30:00Z"'
  },
  organization_id: {
    type: 'number',
    description: 'ID de la organización donde ocurrió el evento',
    required: true,
    example: '2'
  },
  user_id: {
    type: 'string',
    description: 'ID del usuario que disparó el evento (opcional)',
    required: false,
    example: '"user-uuid-123"'
  },
  module: {
    type: 'string',
    description: 'Módulo del sistema donde se originó el evento',
    required: true,
    example: '"crm", "ventas", "inventario"'
  }
};

// Campos específicos por módulo
const MODULE_SPECIFIC_FIELDS = {
  crm: {
    customer_id: {
      type: 'string',
      description: 'ID del cliente relacionado',
      example: '"customer-uuid-456"'
    },
    customer_name: {
      type: 'string', 
      description: 'Nombre del cliente',
      example: '"Juan Pérez"'
    },
    customer_email: {
      type: 'string',
      description: 'Email del cliente',
      example: '"juan@email.com"'
    },
    lead_score: {
      type: 'number',
      description: 'Puntuación del lead (0-100)',
      example: '85'
    }
  },
  ventas: {
    invoice_id: {
      type: 'string',
      description: 'ID de la factura/venta',
      example: '"FACT-0001"'
    },
    amount: {
      type: 'number',
      description: 'Monto total de la venta',
      example: '250000'
    },
    currency: {
      type: 'string',
      description: 'Moneda de la transacción',
      example: '"COP"'
    },
    payment_method: {
      type: 'string',
      description: 'Método de pago utilizado',
      example: '"credit_card", "cash", "transfer"'
    },
    products: {
      type: 'array',
      description: 'Lista de productos vendidos',
      example: '[{"id": "prod-1", "name": "Producto A", "quantity": 2}]'
    }
  },
  inventario: {
    product_id: {
      type: 'string',
      description: 'ID del producto',
      example: '"prod-uuid-789"'
    },
    product_name: {
      type: 'string',
      description: 'Nombre del producto',
      example: '"Laptop Dell XPS"'
    },
    current_stock: {
      type: 'number',
      description: 'Stock actual del producto',
      example: '15'
    },
    minimum_stock: {
      type: 'number',
      description: 'Stock mínimo requerido',
      example: '10'
    },
    warehouse: {
      type: 'string',
      description: 'Bodega donde está el producto',
      example: '"Bodega Principal"'
    }
  },
  finanzas: {
    transaction_id: {
      type: 'string',
      description: 'ID de la transacción financiera',
      example: '"trans-uuid-999"'
    },
    account_id: {
      type: 'string',
      description: 'ID de la cuenta contable',
      example: '"acc-101"'
    },
    amount: {
      type: 'number',
      description: 'Monto de la transacción',
      example: '1500000'
    },
    transaction_type: {
      type: 'string',
      description: 'Tipo de transacción',
      example: '"income", "expense", "transfer"'
    }
  },
  rrhh: {
    employee_id: {
      type: 'string',
      description: 'ID del empleado',
      example: '"emp-uuid-555"'
    },
    employee_name: {
      type: 'string',
      description: 'Nombre del empleado',
      example: '"María García"'
    },
    department: {
      type: 'string',
      description: 'Departamento del empleado',
      example: '"Ventas"'
    },
    position: {
      type: 'string',
      description: 'Cargo del empleado',
      example: '"Ejecutivo de Ventas"'
    }
  },
  pms: {
    reservation_id: {
      type: 'string',
      description: 'ID de la reserva',
      example: '"res-uuid-777"'
    },
    room_number: {
      type: 'string',
      description: 'Número de habitación',
      example: '"101"'
    },
    guest_name: {
      type: 'string',
      description: 'Nombre del huésped',
      example: '"Carlos López"'
    },
    check_in: {
      type: 'string',
      description: 'Fecha de check-in',
      example: '"2025-02-01"'
    },
    check_out: {
      type: 'string',
      description: 'Fecha de check-out',
      example: '"2025-02-05"'
    }
  }
};

// Ejemplos completos por módulo - Estructura correcta
const PAYLOAD_EXAMPLES = {
  crm: {
    title: 'Evento CRM - Estructura para Lead/Cliente',
    payload: {
      "event_id": "{{uuid_generado_automaticamente}}",
      "event_type": "crm.lead_qualified",
      "timestamp": "{{fecha_hora_actual}}",
      "organization_id": "{{id_organizacion}}",
      "user_id": "{{id_usuario_logueado}}",
      "event_data": {
        "customer_id": "{{uuid_del_cliente}}",
        "customer_name": "{{nombre_del_cliente}}",
        "customer_email": "{{email_del_cliente}}",
        "lead_score": "{{puntuacion_numerica}}",
        "source": "{{origen_del_lead}}",
        "campaign": "{{campania_relacionada}}",
        "status": "{{estado_actual}}"
      }
    }
  },
  ventas: {
    title: 'Evento Ventas - Estructura para Factura/Venta',
    payload: {
      "event_id": "{{uuid_generado_automaticamente}}",
      "event_type": "sales.invoice_created",
      "timestamp": "{{fecha_hora_actual}}",
      "organization_id": "{{id_organizacion}}",
      "user_id": "{{id_usuario_logueado}}",
      "event_data": {
        "invoice_id": "{{numero_factura}}",
        "customer_name": "{{nombre_cliente}}",
        "customer_email": "{{email_cliente}}",
        "amount": "{{monto_numerico}}",
        "currency": "{{codigo_moneda}}",
        "payment_method": "{{metodo_pago}}",
        "due_date": "{{fecha_vencimiento}}",
        "products": [
          {
            "id": "{{id_producto}}",
            "name": "{{nombre_producto}}",
            "quantity": "{{cantidad_numerica}}",
            "price": "{{precio_unitario}}"
          }
        ]
      }
    }
  },
  inventario: {
    title: 'Evento Inventario - Estructura para Stock',
    payload: {
      "event_id": "{{uuid_generado_automaticamente}}",
      "event_type": "inventory.low_stock",
      "timestamp": "{{fecha_hora_actual}}",
      "organization_id": "{{id_organizacion}}",
      "event_data": {
        "product_id": "{{id_producto}}",
        "product_name": "{{nombre_producto}}",
        "sku": "{{codigo_producto}}",
        "current_stock": "{{stock_actual_numerico}}",
        "minimum_stock": "{{stock_minimo_numerico}}",
        "warehouse": "{{nombre_bodega}}",
        "category": "{{categoria_producto}}",
        "supplier": "{{proveedor}}"
      }
    }
  },
  finanzas: {
    title: 'Evento Finanzas - Estructura para Transacción',
    payload: {
      "event_id": "{{uuid_generado_automaticamente}}",
      "event_type": "finance.transaction_approved",
      "timestamp": "{{fecha_hora_actual}}",
      "organization_id": "{{id_organizacion}}",
      "user_id": "{{id_usuario_logueado}}",
      "event_data": {
        "transaction_id": "{{id_transaccion}}",
        "account_id": "{{id_cuenta_contable}}",
        "amount": "{{monto_numerico}}",
        "currency": "{{codigo_moneda}}",
        "transaction_type": "{{tipo: income|expense|transfer}}",
        "description": "{{descripcion_transaccion}}",
        "reference": "{{referencia_externa}}",
        "category": "{{categoria_contable}}"
      }
    }
  },
  rrhh: {
    title: 'Evento RR.HH. - Estructura para Empleado',
    payload: {
      "event_id": "{{uuid_generado_automaticamente}}",
      "event_type": "hr.employee_hired",
      "timestamp": "{{fecha_hora_actual}}",
      "organization_id": "{{id_organizacion}}",
      "user_id": "{{id_usuario_logueado}}",
      "event_data": {
        "employee_id": "{{id_empleado}}",
        "employee_name": "{{nombre_completo}}",
        "employee_email": "{{email_empleado}}",
        "department": "{{departamento}}",
        "position": "{{cargo_puesto}}",
        "salary": "{{salario_numerico}}",
        "start_date": "{{fecha_inicio}}",
        "contract_type": "{{tipo_contrato}}"
      }
    }
  },
  pms: {
    title: 'Evento PMS - Estructura para Reserva',
    payload: {
      "event_id": "{{uuid_generado_automaticamente}}",
      "event_type": "pms.reservation_created",
      "timestamp": "{{fecha_hora_actual}}",
      "organization_id": "{{id_organizacion}}",
      "user_id": "{{id_usuario_logueado}}",
      "event_data": {
        "reservation_id": "{{id_reserva}}",
        "room_number": "{{numero_habitacion}}",
        "room_type": "{{tipo_habitacion}}",
        "guest_name": "{{nombre_huesped}}",
        "guest_email": "{{email_huesped}}",
        "check_in": "{{fecha_checkin}}",
        "check_out": "{{fecha_checkout}}",
        "total_amount": "{{monto_total_numerico}}",
        "nights": "{{numero_noches}}"
      }
    }
  },
  custom: {
    title: 'Evento Personalizado - Estructura Base',
    payload: {
      "event_id": "{{uuid_generado_automaticamente}}",
      "event_type": "{{codigo_evento_personalizado}}",
      "timestamp": "{{fecha_hora_actual}}",
      "organization_id": "{{id_organizacion}}",
      "user_id": "{{id_usuario_opcional}}",
      "event_data": {
        "description": "{{descripcion_del_evento}}",
        "entity_id": "{{id_entidad_relacionada}}",
        "entity_type": "{{tipo_entidad}}",
        "custom_field_1": "{{valor_personalizado_1}}",
        "custom_field_2": "{{valor_personalizado_2}}",
        "metadata": {
          "source": "{{origen_evento}}",
          "priority": "{{prioridad}}",
          "tags": ["{{etiqueta1}}", "{{etiqueta2}}"]
        }
      }
    }
  }
};

export function PayloadHelpDialog({ 
  isOpen, 
  onClose, 
  onSelectPayload, 
  currentModule 
}: PayloadHelpDialogProps) {
  const [activeTab, setActiveTab] = useState('examples');

  const handleCopyPayload = (payload: any) => {
    const jsonString = JSON.stringify(payload, null, 2);
    navigator.clipboard.writeText(jsonString);
    toast.success('Payload copiado al portapapeles');
  };

  const handleUsePayload = (payload: any) => {
    const jsonString = JSON.stringify(payload, null, 2);
    onSelectPayload(jsonString);
    toast.success('Payload aplicado al formulario');
    onClose();
  };

  const getModuleIcon = (module: string) => {
    const icons: Record<string, React.ReactNode> = {
      crm: <Users className="h-4 w-4" />,
      ventas: <ShoppingCart className="h-4 w-4" />,
      inventario: <Package className="h-4 w-4" />,
      finanzas: <DollarSign className="h-4 w-4" />,
      rrhh: <Users className="h-4 w-4" />,
      pms: <Building className="h-4 w-4" />,
      custom: <Code className="h-4 w-4" />
    };
    return icons[module] || <Database className="h-4 w-4" />;
  };

  const currentModuleFields = MODULE_SPECIFIC_FIELDS[currentModule as keyof typeof MODULE_SPECIFIC_FIELDS] || {};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Guía de Payloads para Eventos Personalizados
          </DialogTitle>
          <DialogDescription>
            Aprende cómo estructurar los payloads de tus eventos para que las plantillas puedan usar la información correctamente.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="examples">Ejemplos por Módulo</TabsTrigger>
            <TabsTrigger value="fields">Campos Disponibles</TabsTrigger>
            <TabsTrigger value="tips">Consejos y Buenas Prácticas</TabsTrigger>
          </TabsList>

          <TabsContent value="examples" className="space-y-4">
            <div className="grid gap-4">
              {Object.entries(PAYLOAD_EXAMPLES).map(([module, data]) => (
                <Card key={module} className={module === currentModule ? 'ring-2 ring-primary' : ''}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getModuleIcon(module)}
                        {data.title}
                        {module === currentModule && <Badge variant="secondary">Módulo Actual</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyPayload(data.payload)}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copiar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUsePayload(data.payload)}
                        >
                          Usar Este Ejemplo
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm overflow-x-auto">
                      {JSON.stringify(data.payload, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="fields" className="space-y-4">
            <div className="space-y-6">
              {/* Campos Comunes */}
              <Card>
                <CardHeader>
                  <CardTitle>Campos Comunes (Requeridos en todos los módulos)</CardTitle>
                  <CardDescription>Estos campos deben estar presentes en cualquier payload</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(COMMON_FIELDS).map(([field, config]) => (
                      <div key={field} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-sm">
                              {field}
                            </code>
                            <Badge variant={config.required ? 'destructive' : 'secondary'}>
                              {config.required ? 'Requerido' : 'Opcional'}
                            </Badge>
                            <Badge variant="outline">{config.type}</Badge>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                            {config.description}
                          </p>
                          <code className="text-xs text-green-600 dark:text-green-400">
                            Ejemplo: {config.example}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Campos Específicos del Módulo Actual */}
              {Object.keys(currentModuleFields).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {getModuleIcon(currentModule)}
                      Campos Específicos para {currentModule.toUpperCase()}
                    </CardTitle>
                    <CardDescription>Campos adicionales recomendados para este módulo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(currentModuleFields).map(([field, config]) => (
                        <div key={field} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="bg-green-100 dark:bg-green-900 px-2 py-1 rounded text-sm">
                                {field}
                              </code>
                              <Badge variant="outline">{config.type}</Badge>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                              {config.description}
                            </p>
                            <code className="text-xs text-green-600 dark:text-green-400">
                              Ejemplo: {config.example}
                            </code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tips" className="space-y-4">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>💡 Buenas Prácticas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                        ✅ Usa nombres descriptivos
                      </h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Los nombres de campos deben ser claros y descriptivos: <code>customer_name</code> es mejor que <code>name</code>
                      </p>
                    </div>

                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded">
                      <h4 className="font-medium text-green-900 dark:text-green-100 mb-1">
                        ✅ Incluye información de contexto
                      </h4>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Agrega campos como <code>timestamp</code>, <code>user_id</code>, y <code>organization_id</code> para trazabilidad
                      </p>
                    </div>

                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                      <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                        ⚡ Optimiza para plantillas
                      </h4>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Piensa en qué campos usarás en tus plantillas de email/WhatsApp y inclúyelos directamente
                      </p>
                    </div>

                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded">
                      <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-1">
                        🔗 Mantén consistencia
                      </h4>
                      <p className="text-sm text-purple-700 dark:text-purple-300">
                        Usa los mismos nombres de campos en eventos similares para facilitar el mantenimiento
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>🚨 Errores Comunes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded">
                      <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">
                        ❌ JSON inválido
                      </h4>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        Verifica que las comillas sean dobles y que no falten comas o llaves
                      </p>
                    </div>

                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded">
                      <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">
                        ❌ Campos vacíos o undefined
                      </h4>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        Si un campo puede estar vacío, usa <code>null</code> en lugar de omitirlo
                      </p>
                    </div>

                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded">
                      <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">
                        ❌ Información sensible
                      </h4>
                      <p className="text-sm text-red-700 dark:text-red-300">
                        No incluyas contraseñas, tokens o información personal sensible en los payloads
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
