import { Metadata } from "next";
import PaymentMethodsPage from "@/components/finanzas/metodos-pago/PaymentMethodsPage";

export const metadata: Metadata = {
  title: "Métodos de Pago | GO Admin ERP",
  description: "Gestión de métodos de pago aceptados por la organización",
};

export default function Page() {
  return <PaymentMethodsPage />;
}
