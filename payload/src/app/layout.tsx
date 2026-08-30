import "./globals.css";
import "./modern.css";
import "./landing.css";

export const metadata = {
  title: "eDekhbhal — Operational Work, Visibly Under Control",
  description: "Plan, execute, evidence and audit operational work across properties and work areas."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
