import { toast } from 'react-hot-toast';

// Extiende la funcionalidad de react-hot-toast con un método info
export const customToast = {
  ...toast,
  info: (message: string) => toast(message, {
    style: {
      background: '#3b82f6',
      color: '#fff',
      padding: '16px',
      borderRadius: '10px',
    },
    icon: 'ℹ️',
  })
};
