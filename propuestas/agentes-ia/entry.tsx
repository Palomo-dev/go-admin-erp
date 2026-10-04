import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";
import { CabeceraMovilProvider } from "@/components/shell/header/cabeceraMovil";
import { ShellPropuesta } from "./ShellPropuesta";
import { AppPropuesta } from "./AppPropuesta";

// El prototipo opera en memoria: nunca abre una sesión ni envía datos.
window.fetch = async () => {
  throw new Error("La propuesta no permite solicitudes de red.");
};
window.XMLHttpRequest = class extends XMLHttpRequest {
  open(): never {
    throw new Error("La propuesta no permite solicitudes de red.");
  }
};

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider
    locale="es"
    messages={messages}
    timeZone="America/Bogota"
  >
    <CabeceraMovilProvider>
      <ShellPropuesta>
        <AppPropuesta />
      </ShellPropuesta>
    </CabeceraMovilProvider>
  </NextIntlClientProvider>,
);
