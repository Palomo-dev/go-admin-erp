import { customToast } from "./custom-toast";

// Devuelve customToast en el formato esperado por la aplicación
export const useToast = () => {
  return {
    toast: customToast,
  };
};
