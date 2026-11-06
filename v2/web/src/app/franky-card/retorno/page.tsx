import Link from "next/link";
export const metadata = {
  title: "Volver a Franky Card",
  robots: { index: false, follow: false },
};
/** Public handoff for native browsers without web cookies. Query strings never prove payment. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const valid =
    typeof order === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      order,
    );
  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-20">
      <p className="text-sm font-semibold text-violet">franky card</p>
      <h1 className="text-3xl font-bold">Consulta tu compra en Franky</h1>
      <p>
        Vuelve a tu cuenta para comprobar el estado confirmado por el proveedor.
        Cerrar la pasarela no confirma ni cancela un cobro.
      </p>
      {valid ? (
        <>
          <a
            href={"franky://franky-card?order=" + encodeURIComponent(order)}
            className="block rounded-xl bg-violet px-5 py-4 text-center font-semibold text-white"
          >
            Volver a la aplicación
          </a>
          <Link
            href={"/franky-card?order=" + encodeURIComponent(order)}
            className="block text-center underline"
          >
            Consultar el pedido en la web
          </Link>
        </>
      ) : (
        <Link href="/franky-card" className="block underline">
          Abrir mi Franky Card
        </Link>
      )}
    </main>
  );
}
