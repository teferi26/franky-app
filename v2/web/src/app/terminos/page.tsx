import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_ENTITY, LEGAL_UPDATED_AT, SUPPORT_EMAIL } from "@/lib/legal-entity";
import { COMMISSION, OWNER_PLAN, PRICING, formatEur, formatPct, stripeProcessingLabel } from "@/lib/pricing";
import {
  LegalHeader,
  LegalLayout,
  LegalSection,
  LEGAL_A,
  LEGAL_H3,
  LEGAL_LIST,
  LEGAL_P,
  LEGAL_STRONG,
} from "@/lib/legal-ui";

export const metadata: Metadata = {
  title: "Términos de Uso",
  description:
    "Condiciones de uso de Franky: cuenta y edad mínima, normas de la comunidad, entradas de eventos, planes de pago, desistimiento y devoluciones.",
  alternates: { canonical: "/terminos" },
};

// Índice lateral: mismos títulos que las secciones de abajo.
const INDICE = [
  ["aceptacion", "Aceptación"],
  ["servicio", "Descripción del servicio"],
  ["edad", "Edad mínima"],
  ["cuenta", "Registro y cuenta"],
  ["uso-aceptable", "Normas de la comunidad"],
  ["contenido", "Tu contenido"],
  ["planes", "Planes para estudiantes"],
  ["entradas", "Entradas de eventos"],
  ["pagos-pisos", "Visitas y pagos de alquiler"],
  ["profesionales", "Planes para propietarios y locales"],
  ["organizaciones", "Organizaciones y Franky Card"],
  ["mercado", "Mercado entre usuarios"],
  ["desistimiento", "Desistimiento y devoluciones"],
  ["terceros", "Información de terceros"],
  ["propiedad", "Propiedad intelectual"],
  ["responsabilidad", "Responsabilidad"],
  ["baja", "Suspensión y baja"],
  ["modificaciones", "Modificaciones"],
  ["legislacion", "Legislación aplicable"],
] as const;

export default function TerminosPage() {
  const ticketPct = formatPct(COMMISSION.ticket);
  return (
    <div className="min-h-screen bg-bg-primary">
      <LegalHeader title="Términos de Uso" updatedAt={LEGAL_UPDATED_AT} />
      <LegalLayout
        index={INDICE}
        links={[
          { href: "/privacidad", label: "Política de privacidad" },
          { href: "/cookies", label: "Política de cookies" },
          { href: "/aviso-legal", label: "Aviso legal" },
          { href: "/contacto", label: "Contacto" },
        ]}
      >
        <LegalSection id="aceptacion" n={1} title="Aceptación">
          <p className={LEGAL_P}>
            Estos términos regulan el uso de Franky (la web franky.es y la app móvil), cuyo titular es{" "}
            {LEGAL_ENTITY.name} (datos completos en el <Link href="/aviso-legal" className={LEGAL_A}>aviso legal</Link>).
            Al crear una cuenta los aceptas. Si no estás de acuerdo, no crees la cuenta: puedes seguir consultando
            la información pública sin registrarte.
          </p>
        </LegalSection>

        <LegalSection id="servicio" n={2} title="Descripción del servicio">
          <p className={LEGAL_P}>
            Franky es una plataforma para estudiantes en España que ofrece información sobre carreras, notas de
            corte y becas; test vocacional; la comunidad de cada universidad (FOMO, historias y Crush); búsqueda de
            piso y de compañeros de piso; eventos con venta de entradas de organizadores; un mercado entre
            usuarios; y servicios de pago para propietarios, locales y organizaciones.
          </p>
        </LegalSection>

        <LegalSection id="edad" n={3} title="Edad mínima">
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              Para crear una cuenta tienes que tener <strong className={LEGAL_STRONG}>al menos 14 años</strong>.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Crush, Crush Live y la mensajería con personas que no conoces</strong>{" "}
              son solo para mayores de 18 años. Lo comprobamos con la fecha de nacimiento de tu perfil, que debe ser
              verdadera.
            </li>
            <li className="py-3">
              Para comprar entradas, contratar planes de pago o cobrar a través de Franky tienes que tener capacidad
              legal para contratar; si eres menor de edad, necesitas el permiso de tu madre, padre o tutor.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="cuenta" n={4} title="Registro y cuenta">
          <p className={LEGAL_P}>
            Debes dar información veraz y mantenerla al día, y eres responsable de guardar tus credenciales. La
            cuenta es personal: no la compartas ni la vendas. Puedes borrarla cuando quieras desde Perfil &gt;
            Eliminar mi cuenta.
          </p>
        </LegalSection>

        <LegalSection id="uso-aceptable" n={5} title="Normas de la comunidad">
          <p className={LEGAL_P}>
            Tolerancia cero con el acoso, las amenazas, el odio, la explotación sexual, el contenido sexual
            explícito y la difusión de datos privados de otras personas sin su consentimiento. Estas conductas y
            los usuarios abusivos no tienen cabida en Franky.
          </p>
          <p className={LEGAL_P}>
            Antes de publicar en FOMO, Crush o historias debes aceptar expresamente estas normas y autorizar el
            envío del texto, las encuestas y las imágenes de tus publicaciones a Google Gemini para detectar
            abusos. No enviamos tu identificador interno de cuenta. Los audios, vídeos y contenidos dudosos
            permanecen retenidos para revisión del equipo. Consulta el tratamiento de datos en nuestra{" "}
            <Link href="/privacidad" className={LEGAL_A}>política de privacidad</Link>. Las infracciones confirmadas
            suponen la retirada del contenido y la suspensión de la cuenta responsable.
          </p>
          <p className={LEGAL_P}>
            Puedes ocultar una publicación inmediatamente desde su menú. También puedes denunciar desde el menú de
            cada publicación, comentario o historia y bloquear a su autor, también si publica en anónimo. El
            contenido denunciado desaparece de tu vista y el bloqueo impide nuevas interacciones entre ambas
            cuentas. El equipo atiende las denuncias en un plazo de 24 horas. Si una denuncia sigue sin resolver,
            el contenido se retiene preventivamente antes de ese plazo.
          </p>
          <p className={LEGAL_P}>
            Para comunicar un problema o pedir revisión de una decisión escribe a{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LEGAL_A}>{SUPPORT_EMAIL}</a> o utiliza el{" "}
            <Link href="/contacto" className={LEGAL_A}>formulario de contacto</Link>. No incluyas datos privados
            de terceros en publicaciones públicas.
          </p>
          <p className={LEGAL_P}>Además, queda prohibido:</p>
          <ul className={LEGAL_LIST}>
            <li className="py-3">Usar la plataforma para fines ilegales o no autorizados.</li>
            <li className="py-3">Suplantar a otra persona o mentir sobre tu edad.</li>
            <li className="py-3">Intentar acceder a datos de otros usuarios sin autorización.</li>
            <li className="py-3">Publicar contenido ofensivo, fraudulento o que viole derechos de terceros.</li>
            <li className="py-3">Realizar scraping o extracción masiva de datos.</li>
          </ul>
        </LegalSection>

        <LegalSection id="contenido" n={6} title="Tu contenido">
          <p className={LEGAL_P}>
            Lo que publicas sigue siendo tuyo. Nos das una licencia gratuita, no exclusiva y limitada a Franky para
            alojarlo, mostrarlo y adaptarlo técnicamente (por ejemplo, comprimir una imagen) mientras siga
            publicado. Eres responsable de tener derecho a publicarlo. Retiraremos el contenido ilícito en cuanto
            tengamos conocimiento efectivo de él.
          </p>
        </LegalSection>

        <LegalSection id="planes" n={7} title="Planes para estudiantes">
          <p className={LEGAL_P}>
            El uso básico de Franky es gratuito. Los planes opcionales de pago para estudiantes, si los contratas,
            son:
          </p>
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Pro:</strong> {formatEur(PRICING.pro.monthly)} al mes o{" "}
              {formatEur(PRICING.pro.yearly)} al año.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Premium:</strong> {formatEur(PRICING.premium.monthly)} al mes o{" "}
              {formatEur(PRICING.premium.yearly)} al año.
            </li>
          </ul>
          <p className={LEGAL_P}>
            El pago se hace con Stripe y la suscripción se renueva automáticamente al final de cada periodo por el
            mismo importe, salvo que la canceles. Puedes cancelar la renovación en cualquier momento desde tu
            perfil: el plan sigue activo hasta el final del periodo ya pagado. El precio final, con impuestos, se
            muestra antes de pagar. Sobre el desistimiento, consulta el apartado 13.
          </p>
        </LegalSection>

        <LegalSection id="entradas" n={8} title="Entradas de eventos">
          <p className={LEGAL_P}>
            Los eventos los organizan terceros (asociaciones, locales, personas u organizaciones). Franky actúa
            como <strong className={LEGAL_STRONG}>intermediario</strong>: muestra el evento y cobra la entrada por
            cuenta del organizador mediante Stripe. El contrato del evento es entre tú y el organizador, que es
            responsable de celebrarlo en las condiciones anunciadas.
          </p>
          <h3 className={LEGAL_H3}>Precio y comisión</h3>
          <p className={LEGAL_P}>
            El precio que ves antes de pagar es el total e incluye tres partes, que se detallan en el desglose y en
            la factura: lo que recibe el organizador; la comisión de servicio de Franky ({ticketPct} del precio
            total), por el uso de la plataforma; y los gastos de procesamiento del pago con tarjeta (
            {stripeProcessingLabel()} por compra). Si el porcentaje cambia, se mostrará siempre en el desglose
            antes de pagar. Comprar desde la app no tiene recargo.
          </p>
          <h3 className={LEGAL_H3}>Reservas</h3>
          <p className={LEGAL_P}>
            Al empezar la compra reservamos tu plaza durante un tiempo limitado. Si no completas el pago, la reserva
            caduca y la plaza vuelve a estar disponible. Puedes cancelar una reserva sin pagar desde Mis entradas.
          </p>
          <h3 className={LEGAL_H3}>Cancelación del evento y devoluciones</h3>
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              Si el organizador <strong className={LEGAL_STRONG}>cancela el evento</strong>, tienes derecho a la
              devolución del importe pagado. El organizador debe tramitarla; Franky te ayuda a reclamarla.
            </li>
            <li className="py-3">
              Si el evento cambia de fecha o de condiciones esenciales, puedes pedir la devolución.
            </li>
            <li className="py-3">
              En los demás casos, la devolución depende de las condiciones del organizador. Puedes pedirla desde{" "}
              <Link href="/devoluciones" className={LEGAL_A}>Devoluciones</Link>; enviar la solicitud no cancela la
              entrada ni garantiza la devolución.
            </li>
            <li className="py-3">
              Cuando una devolución se aprueba, se reembolsa el importe completo pagado, comisión de servicio
              incluida, en el mismo medio de pago. El banco puede tardar unos días en reflejarlo.
            </li>
          </ul>
          <h3 className={LEGAL_H3}>Si organizas eventos</h3>
          <p className={LEGAL_P}>
            Para cobrar necesitas una cuenta de Stripe conectada. Recibes el precio neto que fijas; la comisión de
            Franky y los gastos de pago se añaden al precio que paga el asistente. Te comprometes a celebrar el
            evento como lo anuncias, a cumplir la normativa aplicable (aforo, licencias, edad mínima de acceso) y a
            devolver el dinero si lo cancelas. No puedes eliminar un evento con entradas pagadas sin haber
            devuelto antes su importe.
          </p>
        </LegalSection>

        <LegalSection id="pagos-pisos" n={9} title="Visitas y pagos de alquiler">
          <p className={LEGAL_P}>
            Algunos propietarios permiten reservar visitas o pagar la renta o la fianza a través de Franky. En esos
            casos Franky también actúa como intermediario del cobro y cobra una comisión de servicio que se muestra
            en el desglose antes de pagar. El contrato de alquiler es entre inquilino y propietario; Franky no es
            parte de él ni garantiza el estado del inmueble. Si pagaste una visita que se cancela, puedes pedir la
            devolución desde la propia reserva.
          </p>
        </LegalSection>

        <LegalSection id="profesionales" n={10} title="Planes para propietarios y locales">
          <p className={LEGAL_P}>Para publicar pisos o locales de ocio ofrecemos estas tarifas:</p>
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Piso por ficha:</strong> {formatEur(PRICING.business_housing.monthly)}{" "}
              al mes por anuncio.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Local de ocio:</strong> {formatEur(PRICING.business_leisure.monthly)} al
              mes o {formatEur(PRICING.business_leisure.yearly, { decimals: 0 })} al año.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Plan Inmobiliarias:</strong> {formatEur(OWNER_PLAN.monthly, { decimals: 0 })}{" "}
              al mes, con hasta {OWNER_PLAN.maxListings} pisos publicados. Incluye una{" "}
              <strong className={LEGAL_STRONG}>prueba gratuita de {OWNER_PLAN.trialDays} días</strong>, una sola vez por
              cuenta: al empezarla guardas tu tarjeta sin pagar nada y, si no cancelas antes de que termine, se cobra
              el primer mes. También puedes elegir pagar el primer trimestre de una vez con un{" "}
              {OWNER_PLAN.introDiscountPct}&nbsp;% de descuento ({formatEur(OWNER_PLAN.introQuarterTotal, { decimals: 0 })})
              y después {formatEur(OWNER_PLAN.monthly, { decimals: 0 })} al mes.
            </li>
          </ul>
          <p className={LEGAL_P}>
            Todas se renuevan automáticamente (cada mes, o cada año en la tarifa anual) hasta que canceles la
            renovación desde Facturación. No hay permanencia: al cancelar, el anuncio sigue activo hasta el final
            del periodo pagado. El importe final se muestra en la pantalla de pago de Stripe antes de confirmar.
          </p>
          <p className={LEGAL_P}>
            Estas tarifas se dirigen a profesionales y propietarios. Si contratas como empresa o profesional no se
            aplica el derecho de desistimiento de los consumidores. Eres responsable de que tus anuncios sean veraces
            y de cumplir la normativa de vivienda y de publicidad aplicable.
          </p>
        </LegalSection>

        <LegalSection id="organizaciones" n={11} title="Organizaciones y Franky Card">
          <p className={LEGAL_P}>
            Las universidades, asociaciones y empresas pueden contratar suscripciones de organización con
            herramientas adicionales (espacios, reservas, campañas, analítica agregada). Los locales pueden adherirse
            a la red Franky Card de ventajas y fidelización para estudiantes. Cuando estos servicios estén
            disponibles para ti, su precio, duración y renovación se mostrarán antes de contratar y se regirán por
            sus condiciones específicas (por ejemplo, las{" "}
            <Link href="/franky-card/condiciones" className={LEGAL_A}>condiciones de Franky Card</Link>), que
            completan estos términos.
          </p>
        </LegalSection>

        <LegalSection id="mercado" n={12} title="Mercado entre usuarios">
          <p className={LEGAL_P}>
            En el mercado, las personas usuarias anuncian artículos y se ponen de acuerdo por chat. Franky solo
            ofrece el espacio para anunciarse: <strong className={LEGAL_STRONG}>no es parte de la compraventa</strong>,
            no cobra ni custodia el dinero, no garantiza los artículos ni la identidad de quien vende. El pago y la
            entrega los acordáis entre vosotros. Recomendamos quedar en sitios públicos y no pagar por adelantado a
            desconocidos. Los anuncios deben ser legales y veraces; puedes denunciar cualquiera que no lo sea.
          </p>
        </LegalSection>

        <LegalSection id="desistimiento" n={13} title="Derecho de desistimiento y devoluciones">
          <p className={LEGAL_P}>
            Si contratas como consumidor un servicio de pago de Franky (por ejemplo, un plan para estudiantes),
            tienes 14 días naturales desde la contratación para desistir sin dar explicaciones, escribiendo a{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LEGAL_A}>{SUPPORT_EMAIL}</a>. Si pediste que el servicio
            empezara de inmediato, te devolveremos el importe descontando la parte proporcional ya prestada (art. 108
            del texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios, TRLGDCU).
          </p>
          <p className={LEGAL_P}>
            <strong className={LEGAL_STRONG}>Excepción de las entradas.</strong> Las entradas para eventos de ocio
            con una fecha o un periodo de ejecución concretos no tienen derecho de desistimiento (art. 103.l del
            TRLGDCU). Esto no afecta a tu derecho a la devolución si el evento se cancela, ni a las condiciones de
            devolución que ofrezca el organizador (apartado 8).
          </p>
          <p className={LEGAL_P}>
            Fuera de estos casos, no hacemos reembolsos por periodos parciales de suscripción, salvo que la ley lo
            exija o que el servicio no se haya podido prestar por causa nuestra.
          </p>
        </LegalSection>

        <LegalSection id="terceros" n={14} title="Información de terceros">
          <p className={LEGAL_P}>
            La información sobre universidades, notas de corte, becas y alojamiento proviene de fuentes públicas
            oficiales. Nos esforzamos por mantenerla actualizada, pero no garantizamos su exactitud absoluta.
            Consulta siempre las fuentes oficiales antes de tomar decisiones.
          </p>
        </LegalSection>

        <LegalSection id="propiedad" n={15} title="Propiedad intelectual">
          <p className={LEGAL_P}>
            El diseño, código, marca y contenidos originales de Franky están protegidos por derechos de propiedad
            intelectual e industrial. No puedes reproducirlos sin autorización expresa.
          </p>
        </LegalSection>

        <LegalSection id="responsabilidad" n={16} title="Responsabilidad">
          <p className={LEGAL_P}>
            Ponemos los medios razonables para que Franky funcione bien y sea seguro, pero no podemos garantizar
            que no haya interrupciones o errores. No respondemos de las decisiones tomadas solo con la información
            de la plataforma, de lo que publiquen otras personas usuarias ni de los eventos, alquileres o
            compraventas entre terceros en los que no somos parte. Nada de esto limita los derechos que te reconoce
            la ley como consumidor ni nuestra responsabilidad cuando no se pueda excluir legalmente.
          </p>
        </LegalSection>

        <LegalSection id="baja" n={17} title="Suspensión y baja">
          <p className={LEGAL_P}>
            Podemos suspender o cerrar cuentas que incumplan estos términos, sobre todo en casos de acoso, fraude o
            si alguien no tiene la edad mínima. Siempre que sea posible te lo explicaremos y podrás pedir revisión.
            Tú puedes darte de baja en cualquier momento; las suscripciones activas dejan de renovarse.
          </p>
        </LegalSection>

        <LegalSection id="modificaciones" n={18} title="Modificaciones">
          <p className={LEGAL_P}>
            Podemos actualizar estos términos para adaptarlos a cambios legales o del servicio. Te avisaremos de los
            cambios importantes por correo o dentro de Franky con antelación razonable. Si no estás de acuerdo,
            puedes borrar tu cuenta y cancelar tus suscripciones antes de que se apliquen.
          </p>
        </LegalSection>

        <LegalSection id="legislacion" n={19} title="Legislación aplicable">
          <p className={LEGAL_P}>
            Estos términos se rigen por la legislación española. Si eres consumidor, serán competentes los juzgados
            y tribunales de tu domicilio. También puedes acudir a los servicios de consumo de tu comunidad
            autónoma. Antes, escríbenos a{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LEGAL_A}>{SUPPORT_EMAIL}</a> y buscaremos una solución.
          </p>
        </LegalSection>
      </LegalLayout>
    </div>
  );
}
