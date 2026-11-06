// See src/app/login/layout.tsx — same CDN caching fix applied to /registro.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
