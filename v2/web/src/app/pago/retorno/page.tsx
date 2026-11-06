import Link from 'next/link';

/** Public hand-off: never claims success from query strings or exposes an order. */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const { order_id } = await searchParams;
  const valid = typeof order_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id);
  return <main className="mx-auto max-w-lg px-6 py-20 space-y-6">
    <h1 className="text-3xl font-bold">Consulta el estado de tu pago</h1>
    <p>Vuelve a Franky para comprobar la confirmación del servidor. Cerrar la pasarela de pago no cancela una reserva ni confirma un cobro.</p>
    {valid ? <a className="block rounded-xl bg-blue-600 px-5 py-3 text-center font-semibold text-white" href={`franky://pago-retorno?order_id=${encodeURIComponent(order_id!)}`}>Volver a la app</a> : <p>No se ha recibido un identificador válido. Revisa tus entradas o reservas.</p>}
    <Link className="block underline" href="/mis-entradas">Consultar mis entradas en la web</Link>
  </main>;
}
