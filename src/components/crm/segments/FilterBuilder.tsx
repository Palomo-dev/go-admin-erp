"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users, Activity, Calendar, Tag, Filter } from "lucide-react";

interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean | string[] | null;
  type: 'customer' | 'event';
}

interface FilterGroup {
  id: string;
  operator: 'AND' | 'OR';
  rules: FilterRule[];
  groups: FilterGroup[];
}

interface FilterBuilderProps {
  filterData: FilterGroup;
  onChange: (filterData: FilterGroup) => void;
  onPreviewChange: (count: number) => void;
  organizationId: number | null;
}

// Definición de campos disponibles para filtros
const CUSTOMER_FIELDS = [
  { value: 'first_name', label: 'Nombre', type: 'text' },
  { value: 'last_name', label: 'Apellido', type: 'text' },
  { value: 'email', label: 'Email', type: 'text' },
  { value: 'phone', label: 'Teléfono', type: 'text' },
  { value: 'city', label: 'Ciudad', type: 'text' },
  { value: 'address', label: 'Dirección', type: 'text' },
  { value: 'identification_type', label: 'Tipo de Identificación', type: 'text' },
  { value: 'identification_number', label: 'Número de Identificación', type: 'text' },
  { value: 'is_registered', label: 'Usuario Registrado', type: 'boolean' },
  { value: 'created_at', label: 'Fecha de Registro', type: 'date' },
  { value: 'updated_at', label: 'Última Actualización', type: 'date' },
  { value: 'tags', label: 'Etiquetas', type: 'array' },
  { value: 'roles', label: 'Roles', type: 'array' }
];

const EVENT_FIELDS = [
  { value: 'purchase_count', label: 'Número de Compras', type: 'number' },
  { value: 'total_spent', label: 'Total Gastado', type: 'number' },
  { value: 'last_purchase_date', label: 'Última Compra', type: 'date' },
  { value: 'campaign_opened', label: 'Abrió Campaña', type: 'text' },
  { value: 'campaign_clicked', label: 'Hizo Clic en Campaña', type: 'text' },
  { value: 'product_purchased', label: 'Compró Producto', type: 'text' },
  { value: 'days_since_last_activity', label: 'Días Desde Última Actividad', type: 'number' }
];

const OPERATORS = {
  text: [
    { value: 'equals', label: 'Es igual a' },
    { value: 'not_equals', label: 'No es igual a' },
    { value: 'contains', label: 'Contiene' },
    { value: 'not_contains', label: 'No contiene' },
    { value: 'starts_with', label: 'Comienza con' },
    { value: 'ends_with', label: 'Termina con' },
    { value: 'is_empty', label: 'Está vacío' },
    { value: 'is_not_empty', label: 'No está vacío' }
  ],
  number: [
    { value: 'equals', label: 'Es igual a' },
    { value: 'not_equals', label: 'No es igual a' },
    { value: 'greater_than', label: 'Mayor que' },
    { value: 'greater_than_or_equal', label: 'Mayor o igual que' },
    { value: 'less_than', label: 'Menor que' },
    { value: 'less_than_or_equal', label: 'Menor o igual que' },
    { value: 'between', label: 'Entre' }
  ],
  date: [
    { value: 'equals', label: 'Es igual a' },
    { value: 'not_equals', label: 'No es igual a' },
    { value: 'before', label: 'Antes de' },
    { value: 'after', label: 'Después de' },
    { value: 'between', label: 'Entre' },
    { value: 'last_days', label: 'Últimos X días' },
    { value: 'next_days', label: 'Próximos X días' }
  ],
  boolean: [
    { value: 'is_true', label: 'Es verdadero' },
    { value: 'is_false', label: 'Es falso' }
  ],
  array: [
    { value: 'contains', label: 'Contiene' },
    { value: 'not_contains', label: 'No contiene' },
    { value: 'is_empty', label: 'Está vacío' },
    { value: 'is_not_empty', label: 'No está vacío' }
  ]
};

/**
 * Componente constructor visual de filtros para segmentos
 * Permite crear reglas complejas con operadores AND/OR
 */
export default function FilterBuilder({ filterData, onChange }: FilterBuilderProps) {

  // Generar ID único para nuevas reglas/grupos
  const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Agregar nueva regla
  const addRule = (groupId?: string) => {
    const newRule: FilterRule = {
      id: generateId(),
      field: '',
      operator: '',
      value: '',
      type: 'customer'
    };

    if (groupId) {
      // Agregar a un grupo específico
      const updatedFilter = addRuleToGroup(filterData, groupId, newRule);
      onChange(updatedFilter);
    } else {
      // Agregar al grupo raíz
      const updatedFilter = {
        ...filterData,
        rules: [...filterData.rules, newRule]
      };
      onChange(updatedFilter);
    }
  };

  // Agregar nuevo grupo
  const addGroup = (parentGroupId?: string) => {
    const newGroup: FilterGroup = {
      id: generateId(),
      operator: 'AND',
      rules: [],
      groups: []
    };

    if (parentGroupId) {
      const updatedFilter = addGroupToGroup(filterData, parentGroupId, newGroup);
      onChange(updatedFilter);
    } else {
      const updatedFilter = {
        ...filterData,
        groups: [...filterData.groups, newGroup]
      };
      onChange(updatedFilter);
    }
  };

  // Funciones auxiliares para manipular la estructura de filtros
  const addRuleToGroup = (group: FilterGroup, targetGroupId: string, rule: FilterRule): FilterGroup => {
    if (group.id === targetGroupId) {
      return {
        ...group,
        rules: [...group.rules, rule]
      };
    }

    return {
      ...group,
      groups: group.groups.map(subGroup => addRuleToGroup(subGroup, targetGroupId, rule))
    };
  };

  const addGroupToGroup = (group: FilterGroup, targetGroupId: string, newGroup: FilterGroup): FilterGroup => {
    if (group.id === targetGroupId) {
      return {
        ...group,
        groups: [...group.groups, newGroup]
      };
    }

    return {
      ...group,
      groups: group.groups.map(subGroup => addGroupToGroup(subGroup, targetGroupId, newGroup))
    };
  };

  const updateRule = (ruleId: string, field: string, value: string | number | boolean | string[] | null) => {
    const updatedFilter = updateRuleInGroup(filterData, ruleId, field, value);
    onChange(updatedFilter);
  };

  const updateRuleInGroup = (group: FilterGroup, ruleId: string, field: string, value: string | number | boolean | string[] | null): FilterGroup => {
    return {
      ...group,
      rules: group.rules.map(rule => 
        rule.id === ruleId ? { ...rule, [field]: value } : rule
      ),
      groups: group.groups.map(subGroup => updateRuleInGroup(subGroup, ruleId, field, value))
    };
  };

  const removeRule = (ruleId: string) => {
    const updatedFilter = removeRuleFromGroup(filterData, ruleId);
    onChange(updatedFilter);
  };

  const removeRuleFromGroup = (group: FilterGroup, ruleId: string): FilterGroup => {
    return {
      ...group,
      rules: group.rules.filter(rule => rule.id !== ruleId),
      groups: group.groups.map(subGroup => removeRuleFromGroup(subGroup, ruleId))
    };
  };

  const removeGroup = (groupId: string) => {
    const updatedFilter = removeGroupFromGroup(filterData, groupId);
    onChange(updatedFilter);
  };

  const removeGroupFromGroup = (group: FilterGroup, groupId: string): FilterGroup => {
    return {
      ...group,
      groups: group.groups.filter(subGroup => subGroup.id !== groupId)
        .map(subGroup => removeGroupFromGroup(subGroup, groupId))
    };
  };

  // Obtener campo por valor
  const getFieldByValue = (value: string, type: 'customer' | 'event') => {
    const fields = type === 'customer' ? CUSTOMER_FIELDS : EVENT_FIELDS;
    return fields.find(field => field.value === value);
  };

  // Obtener operadores para un tipo de campo
  const getOperatorsForField = (fieldValue: string, type: 'customer' | 'event') => {
    const field = getFieldByValue(fieldValue, type);
    if (!field) return [];
    return OPERATORS[field.type as keyof typeof OPERATORS] || [];
  };

  // Renderizar una regla individual
  const renderRule = (rule: FilterRule) => {
    const field = getFieldByValue(rule.field, rule.type);
    const operators = getOperatorsForField(rule.field, rule.type);
    const needsValue = rule.operator && !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(rule.operator);

    return (
      <div key={rule.id} className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        {/* Tipo de campo */}
        <Select
          value={rule.type}
          onValueChange={(value: 'customer' | 'event') => updateRule(rule.id, 'type', value)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Cliente</span>
              </div>
            </SelectItem>
            <SelectItem value="event">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4" />
                <span>Evento</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Campo */}
        <Select
          value={rule.field}
          onValueChange={(value) => updateRule(rule.id, 'field', value)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Seleccionar campo" />
          </SelectTrigger>
          <SelectContent>
            {(rule.type === 'customer' ? CUSTOMER_FIELDS : EVENT_FIELDS).map(field => (
              <SelectItem key={field.value} value={field.value}>
                <div className="flex items-center space-x-2">
                  {field.type === 'date' && <Calendar className="h-4 w-4" />}
                  {field.type === 'array' && <Tag className="h-4 w-4" />}
                  <span>{field.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Operador */}
        <Select
          value={rule.operator}
          onValueChange={(value) => updateRule(rule.id, 'operator', value)}
          disabled={!rule.field}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Operador" />
          </SelectTrigger>
          <SelectContent>
            {operators.map(op => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Valor */}
        {needsValue && (
          <Input
            placeholder="Valor"
            value={rule.value?.toString() || ''}
            onChange={(e) => updateRule(rule.id, 'value', e.target.value)}
            type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text'}
            className="w-32"
          />
        )}

        {/* Botón eliminar */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeRule(rule.id)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  // Renderizar un grupo de filtros
  const renderGroup = (group: FilterGroup, isRoot = false) => {
    return (
      <Card key={group.id} className={`${isRoot ? '' : 'ml-6 border-l-4 border-blue-200 dark:border-blue-800'}`}>
        <CardContent className="p-4 space-y-4">
          {!isRoot && (
            <div className="flex items-center justify-between">
              <Select
                value={group.operator}
                onValueChange={(value: 'AND' | 'OR') => {
                  const updatedFilter = updateGroupOperator(filterData, group.id, value);
                  onChange(updatedFilter);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">Y</SelectItem>
                  <SelectItem value="OR">O</SelectItem>
                </SelectContent>
              </Select>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeGroup(group.id)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Renderizar reglas */}
          {group.rules.map(rule => renderRule(rule))}

          {/* Renderizar subgrupos */}
          {group.groups.map(subGroup => renderGroup(subGroup))}

          {/* Botones para agregar */}
          <div className="flex items-center space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addRule(group.id)}
              className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <Plus className="h-4 w-4 mr-1" />
              Regla
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addGroup(group.id)}
              className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-900/20"
            >
              <Plus className="h-4 w-4 mr-1" />
              Grupo
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const updateGroupOperator = (group: FilterGroup, groupId: string, operator: 'AND' | 'OR'): FilterGroup => {
    if (group.id === groupId) {
      return { ...group, operator };
    }

    return {
      ...group,
      groups: group.groups.map(subGroup => updateGroupOperator(subGroup, groupId, operator))
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Constructor de Filtros</Label>
        <Badge variant="outline" className="text-xs">
          {filterData.operator} - {filterData.rules.length} reglas, {filterData.groups.length} grupos
        </Badge>
      </div>

      {/* Operador principal */}
      <div className="flex items-center space-x-2">
        <Label>Operador principal:</Label>
        <Select
          value={filterData.operator}
          onValueChange={(value: 'AND' | 'OR') => onChange({ ...filterData, operator: value })}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">Y</SelectItem>
            <SelectItem value="OR">O</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Renderizar el grupo raíz */}
      {renderGroup(filterData, true)}

      {/* Mensaje cuando no hay filtros */}
      {filterData.rules.length === 0 && filterData.groups.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No hay filtros configurados</p>
          <p className="text-sm">Agrega reglas para comenzar a segmentar tus clientes</p>
        </div>
      )}
    </div>
  );
}
