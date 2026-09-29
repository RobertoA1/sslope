import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Century Lab · Análisis y entrenamiento',
  description: 'Laboratorio independiente con observaciones reales de Century Mine, EDA y comparación temporal de modelos.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
