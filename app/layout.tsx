import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:"Pulse & Pace | Gestão de Atacado",
  description:"Gestão de clientes, artes, pedidos e produção de camisetas personalizadas.",
  icons:{icon:"/favicon.svg"},
};

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
