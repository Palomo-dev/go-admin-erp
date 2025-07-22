"use client";

import { Customer, CustomerInteraction } from "../types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  Clock,
  Phone,
  Mail,
  Users,
  FileText,
  CalendarDays,
} from "lucide-react";

interface CustomerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  interactions: CustomerInteraction[];
  isLoading: boolean;
}

export default function CustomerHistoryModal({
  isOpen,
  onClose,
  customer,
  interactions,
  isLoading,
}: CustomerHistoryModalProps) {
  if (!customer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Historial del Cliente
          </DialogTitle>
          <DialogDescription>
            Historial de interacciones con {customer.full_name}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <LoadingSpinner size="md" className="text-blue-500" />
            </div>
          ) : interactions.length > 0 ? (
            <div className="space-y-4">
              {interactions.map((interaction) => (
                <div
                  key={interaction.id}
                  className="border border-gray-200 dark:border-gray-800 rounded-md p-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">
                        {interaction.activity_type.charAt(0).toUpperCase() +
                          interaction.activity_type.slice(1)}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {interaction.activity_type === "call" && (
                          <Phone className="h-3 w-3" />
                        )}
                        {interaction.activity_type === "email" && (
                          <Mail className="h-3 w-3" />
                        )}
                        {interaction.activity_type === "meeting" && (
                          <Users className="h-3 w-3" />
                        )}
                        {interaction.activity_type === "note" && (
                          <FileText className="h-3 w-3" />
                        )}
                        {!["call", "email", "meeting", "note"].includes(
                          interaction.activity_type
                        ) && <Clock className="h-3 w-3" />}
                        <span>
                          {interaction.metadata?.title ||
                            interaction.activity_type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        {interaction.notes}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500">
                      <CalendarDays className="h-3 w-3 inline-block mr-1" />
                      {new Date(
                        interaction.occurred_at || interaction.created_at
                      ).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400 italic text-center p-8">
              No hay interacciones registradas para este cliente.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
