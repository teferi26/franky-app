import Link from "next/link";
import { CARD_AGREEMENT_VERSION } from "../../../../../shared/franky-card";
export const metadata = {
  title: "Franky Card · Condiciones de adhesión",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-7 px-5 py-12 text-sm leading-relaxed">
      <Link href="/franky-card" className="text-violet">
        ← Franky Card
      </Link>
      <h1 className="text-3xl font-bold">Condiciones de la red Franky Card</h1>
      <p>
        Versión {CARD_AGREEMENT_VERSION} · 23 de septiembre de 2026. Estas
        condiciones complementan los{" "}
        <Link href="/terminos" className="underline">
          términos generales de Franky
        </Link>{" "}
        y la{" "}
        <Link href="/privacidad" className="underline">
          política de privacidad
        </Link>
        . La adhesión se solicita por una persona autorizada por el
        establecimiento y sólo entra en vigor después de su aprobación.
      </p>
      <section>
        <h2 className="text-xl font-bold">1. Adhesión y ventaja base</h2>
        <p className="mt-3">
          La adhesión a la red, la validación de tarjetas y el registro de
          fidelización son gratuitos. El negocio acepta una ventaja base de al
          menos el 5% sobre uno o varios servicios habituales claramente
          identificados. Los planes opcionales de software se contratan por
          separado. La verificación y la posición en los resultados no se
          compran con esta adhesión.
        </p>
        <p className="mt-3">
          El comercio debe publicar antes del uso los servicios incluidos,
          horarios, importe mínimo, exclusiones, edad mínima cuando proceda y
          fechas de las campañas. Debe aplicar la ventaja sobre precios reales,
          no aumentar previamente el precio para simular un descuento ni
          declarar un ahorro superior al existente frente a la oferta pública
          disponible.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">2. Cómo se registra una operación</h2>
        <p className="mt-3">
          Una persona del equipo autorizada escanea la tarjeta y propone el
          importe y las condiciones. El titular revisa y confirma; el comercio
          completa el registro después de cobrar y realizar el servicio. Cada
          ticket o referencia corresponde a una sola operación. Escanear no
          autoriza cobros, no suma sellos y no prueba que un servicio haya sido
          pagado.
        </p>
        <p className="mt-3">
          El pago del servicio se realiza con el establecimiento por el medio
          acordado. Franky conserva el registro del descuento y de la
          fidelización. Los importes introducidos manualmente son declaraciones
          del comercio y no equivalen a una conciliación bancaria.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">3. Sellos y premios</h2>
        <p className="mt-3">
          Cada programa identifica los servicios elegibles, número de servicios
          pagados necesarios, premio concreto, límite de valor y condiciones.
          Una operación elegible concede como máximo un sello. El servicio
          gratuito obtenido como premio no genera otro sello. Los cambios crean
          una versión nueva y respetan los derechos ya acumulados en versiones
          anteriores.
        </p>
        <p className="mt-3">
          Los sellos y premios son personales y no se cambian por dinero ni se
          transfieren. No caducan por el vencimiento de la Card de pago. El
          comercio mantiene su obligación de atender los premios ganados aunque
          cierre la captación de nuevos sellos o abandone la red; debe comunicar
          y resolver con Franky los casos de cierre del negocio.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">4. Correcciones y devoluciones</h2>
        <p className="mt-3">
          Toda corrección identifica las líneas afectadas y su motivo. Se
          conserva el registro original y se añade el ajuste correspondiente. Se
          revierte únicamente el ahorro y los sellos vinculados a los servicios
          afectados. El importe a devolver se basa en lo realmente pagado; no se
          encarecen retroactivamente los servicios restantes. El comercio
          realiza la devolución por el medio de pago original y conserva su
          justificante.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">5. Datos y uso de la identidad</h2>
        <p className="mt-3">
          Durante una operación confirmada por el titular, el personal
          autorizado puede comprobar su nombre y fotografía. No recibe su
          identidad anónima en FOMO, estudios, correo o mensajes privados. No
          puede copiar la foto, reutilizar el QR, elaborar bases externas ni
          contactar con fines publicitarios sin una autorización específica y
          separada. Los permisos del equipo deben limitarse a su función y
          revocarse cuando termine su relación con el negocio.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">6. Suspensión, cambios y salida</h2>
        <p className="mt-3">
          Franky puede pausar operaciones o la presencia del local ante
          incumplimientos, riesgos de fraude o incidencias que impidan prestar
          el servicio, conservando el historial y la posibilidad de revisión. El
          comercio puede solicitar su salida y dejar de ofrecer nuevas ventajas
          tras resolver las operaciones y compromisos ya aceptados. Ningún
          cambio elimina premios ganados ni derechos de devolución.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-bold">7. Card personal</h2>
        <p className="mt-3">
          La cuenta y la fidelización básica son gratuitas. La Card de
          descuentos se ofrece por periodos de doce meses, con precio total y
          comercios disponibles visibles antes del pago. La renovación es
          manual. La tarjeta es una identificación privada de Franky y no
          acredita matrícula universitaria, acceso a instalaciones ni condición
          oficial de estudiante. Los beneficios reservados a estudiantes o a una
          edad concreta requieren verificación independiente.
        </p>
        <p className="mt-3">
          El ahorro futuro depende de los servicios que realmente utilices. No
          se garantizan cifras de ahorro ni la permanencia de todos los
          establecimientos. Para consultas sobre compras, correcciones o
          devoluciones utiliza{" "}
          <Link className="underline" href="/contacto">
            el canal de contacto de Franky
          </Link>
          . Estas condiciones no limitan los derechos legales de las personas
          consumidoras.
        </p>
      </section>
    </main>
  );
}
