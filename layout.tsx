import "./globals.css";
export const metadata = { title: "eDekhbhal", description: "Multi-tenant property and work-area management" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
