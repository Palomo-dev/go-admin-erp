"use client";

import { Customer } from "../types";
import { formatCurrency } from "@/utils/Utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowUpDown,
  MoreHorizontal,
  Mail,
  Phone,
  User,
} from "lucide-react";

// Función para obtener las iniciales del nombre
const getInitials = (name: string): string => {
  if (!name) return "??";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface CustomersTableProps {
  customers: Customer[];
  onViewDetails: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
  onViewHistory: (customer: Customer) => void;
  onCreateOpportunity: (customer: Customer) => void;
  onSort: (field: string) => void;
  sortField: string;
  sortDirection: "asc" | "desc";
}

export default function CustomersTable({
  customers,
  onViewDetails,
  onEdit,
  onViewHistory,
  onCreateOpportunity,
  onSort,
  sortField,
  sortDirection,
}: CustomersTableProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <TableHead
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm"
              onClick={() => onSort("full_name")}
            >
              <div className="flex items-center gap-1">
                Cliente
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm hidden sm:table-cell"
              onClick={() => onSort("email")}
            >
              <div className="flex items-center gap-1">
                Contacto
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm hidden md:table-cell"
              onClick={() => onSort("total_opportunities")}
            >
              <div className="flex items-center gap-1">
                Oportunidades
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm"
              onClick={() => onSort("total_value")}
            >
              <div className="flex items-center gap-1">
                Valor
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead className="w-[100px] text-gray-900 dark:text-gray-100 font-semibold text-xs sm:text-sm"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length > 0 ? (
            customers.map((customer) => (
              <TableRow
                key={customer.id}
                onClick={() => onViewDetails(customer)}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <TableCell className="p-2 sm:p-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar del cliente */}
                    <Avatar className="h-10 w-10 flex-shrink-0 border-2 border-gray-200 dark:border-gray-700">
                      <AvatarImage 
                        src={customer.avatar_url} 
                        alt={customer.full_name}
                        className="object-cover"
                      />
                      <AvatarFallback className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-sm font-medium">
                        {getInitials(customer.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm truncate">
                        {customer.full_name}
                      </div>
                      {/* Mostrar contacto en móvil */}
                      <div className="sm:hidden mt-1 space-y-0.5">
                        {customer.email && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{customer.email}</div>
                        )}
                        {customer.phone && (
                          <div className="text-xs text-gray-600 dark:text-gray-400">{customer.phone}</div>
                        )}
                      </div>
                      {customer.latest_opportunity && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Última: {customer.latest_opportunity.name.substring(0, 15)}
                          {customer.latest_opportunity.name.length > 15 ? "..." : ""}
                          <span
                            className={`ml-2 px-1.5 py-0.5 text-[10px] rounded-sm font-medium ${
                              customer.latest_opportunity.status === "won"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : customer.latest_opportunity.status === "lost"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            }`}
                          >
                            {customer.latest_opportunity.status === "won"
                              ? "Ganada"
                              : customer.latest_opportunity.status === "lost"
                              ? "Perdida"
                              : "Activa"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell p-2 sm:p-3">
                  <div className="flex flex-col gap-1">
                    {customer.email && (
                      <a
                        href={`mailto:${customer.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px]"
                      >
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </a>
                    )}
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        {customer.phone}
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell p-2 sm:p-3">
                  <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">
                    Total: {customer.total_opportunities}
                  </div>
                  {customer.has_opportunities && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Activas: {customer.active_opportunities} | Ganadas:{" "}
                      {customer.won_opportunities}
                    </div>
                  )}
                </TableCell>
                <TableCell className="p-2 sm:p-3">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                    {formatCurrency(customer.total_value)}
                  </div>
                  {/* Mostrar oportunidades en móvil */}
                  <div className="md:hidden text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {customer.total_opportunities} oportunidades
                  </div>
                </TableCell>
                <TableCell className="p-2 sm:p-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <MoreHorizontal className="h-5 w-5 sm:h-4 sm:w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 w-56">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(customer);
                      }} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                        Ver detalles
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onEdit(customer);
                      }} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onCreateOpportunity(customer);
                      }} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                        Nueva oportunidad
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onViewHistory(customer);
                      }} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                        Ver historial
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        if (customer.email) {
                          const subject = encodeURIComponent("Seguimiento");
                          const body = encodeURIComponent(`Estimado/a ${customer.full_name}\n\nEspero que este mensaje le encuentre bien.\n\nQuería hacer seguimiento sobre nuestras conversaciones recientes.\n\nSaludos cordiales,`);
                          window.location.href = `mailto:${customer.email}?subject=${subject}&body=${body}`;
                        } else {
                          alert("Este cliente no tiene correo electrónico registrado.");
                        }
                      }} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                        Enviar correo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
                No hay clientes que coincidan con la búsqueda.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
