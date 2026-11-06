import { ComparisonProvider } from "./components/comparison-context";
import ComparisonBar from "./components/comparison-bar";

export default function AlojamientoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ComparisonProvider>
      {children}
      <ComparisonBar />
    </ComparisonProvider>
  );
}
