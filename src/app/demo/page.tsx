import Link from "next/link";
import { brand } from "@/lib/brand";

export default function DemoPage() {
  return (
    <main className="simplePage">
      <div className="simpleCard">
        <span className="eyebrow">BEST PRACTICE DEMO</span>
        <h1>Explore {brand.productName}</h1>
        <p>
          The universal Demo Workspace will be implemented alongside every real feature.
          It will use synthetic data and never become a shared tenant Organization.
        </p>
        <Link className="button" href="/">Back to landing page</Link>
      </div>
    </main>
  );
}
