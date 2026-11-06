import type { Metadata } from "next";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cartel: Crush",
  description: "Cartel imprimible con QR para la campaña de captación de Crush.",
  robots: { index: false, follow: false },
};

const BASE_URL = "https://franky.es/crush";

export default async function CartelPage({
  searchParams,
}: {
  searchParams: Promise<{ uni?: string; ref?: string }>;
}) {
  const sp = await searchParams;
  const uni = typeof sp.uni === "string" ? sp.uni : null;
  const ref = typeof sp.ref === "string" ? sp.ref : null;

  // URL de destino del QR (con ref de campaña opcional para atribución).
  const target = ref
    ? `${BASE_URL}?ref=${encodeURIComponent(ref)}`
    : BASE_URL;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&format=png&data=${encodeURIComponent(
    target
  )}`;

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      {/* Barra de acciones (no se imprime) */}
      <div className="mx-auto mb-6 flex max-w-[420px] items-center justify-between px-4 print:hidden">
        <p className="text-sm text-gray-500">
          Vista previa del cartel · A escala
        </p>
        <PrintButton />
      </div>

      {/* Cartel A4 vertical */}
      <div className="mx-auto flex aspect-[210/297] w-full max-w-[420px] flex-col items-center justify-between bg-gradient-to-b from-violet to-fuchsia px-8 py-12 text-center text-white shadow-xl print:max-w-none print:shadow-none">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/80">
            Franky
          </p>
          <h1 className="mt-6 font-heading text-6xl font-extrabold leading-tight">
            Crush
          </h1>
          <p className="mt-4 text-lg font-medium text-white/90">
            {uni
              ? `Gente de ${uni} que estudia cerca de ti`
              : "Gente de tu uni que estudia cerca de ti"}
          </p>
        </div>

        {/* QR */}
        <div className="rounded-3xl bg-white p-5 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="Escanéame"
            className="h-56 w-56"
            width={224}
            height={224}
          />
        </div>

        <div>
          <p className="text-2xl font-extrabold">Escanéame 👀</p>
          <p className="mt-2 text-sm text-white/85">
            Intercambio mutuo de Instagram. Solo +18.
            <br />
            Sin postureo, sin acoso. Tú decides.
          </p>
          <p className="mt-4 text-lg font-bold">franky.es/crush</p>
        </div>
      </div>
    </div>
  );
}
