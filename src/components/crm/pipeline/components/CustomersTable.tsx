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
import {
  ArrowUpDown,
  MoreHorizontal,
  Mail,
  Phone,
} from "lucide-react";

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
    <div className="rounded-md border border-gray-200 dark:border-gray-800">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <TableHead
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => onSort("full_name")}
            >
              <div className="flex items-center gap-1">
                Cliente
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => onSort("email")}
            >
              <div className="flex items-center gap-1">
                Contacto
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => onSort("total_opportunities")}
            >
              <div className="flex items-center gap-1">
                Oportunidades
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => onSort("total_value")}
            >
              <div className="flex items-center gap-1">
                Valor
                <ArrowUpDown className="h-3 w-3" />
              </div>
            </TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length > 0 ? (
            customers.map((customer) => (
              <TableRow
                key={customer.id}
                onClick={() => onViewDetails(customer)}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <TableCell>
                  <div className="font-medium">{customer.full_name}</div>
                  {customer.latest_opportunity && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Última: {customer.latest_opportunity.name.substring(0, 15)}
                      {customer.latest_opportunity.name.length > 15 ? "..." : ""}
                      <span
                        className={`ml-2 px-1.5 py-0.5 text-[10px] rounded-sm ${
                          customer.latest_opportunity.status === "won"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-500"
                            : customer.latest_opportunity.status === "lost"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-500"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500"
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
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {customer.email && (
                      <a
                        href={`mailto:${customer.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {customer.email}
                      </a>
                    )}
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    Total: {customer.total_opportunities}
                  </div>
                  {customer.has_opportunities && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Activas: {customer.active_opportunities} | Ganadas:{" "}
                      {customer.won_opportunities}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {formatCurrency(customer.total_value)}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 p-0"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(customer);
                      }}>
                        Ver detalles
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onEdit(customer);
                      }}>
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onCreateOpportunity(customer);
                      }}>
                        Nueva oportunidad
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onViewHistory(customer);
                      }}>
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
                      }}>
                        Enviar correo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                No hay clientes que coincidan con la búsqueda.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
