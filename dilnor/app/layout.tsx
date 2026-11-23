import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DataProvider } from '@/store/data';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Dilnor · Análise de Promotores & Rotas',
  description: 'Painel executivo de promotores, carteiras e rotas territoriais da Dilnor Distribuidora.',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0E4DA4' };

const themeScript = `try{var t=localStorage.getItem('dilnor-theme');t=t?JSON.parse(t):(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <DataProvider>
          <Shell>{children}</Shell>
        </DataProvider>
      </body>
    </html>
  );
}
