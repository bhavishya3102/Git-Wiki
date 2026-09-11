import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import App from '@/App';
import '@/index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider delayDuration={200}>
        <App />
        <Toaster position="bottom-right" toastOptions={{ className: 'font-body !rounded-none' }} />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
);
