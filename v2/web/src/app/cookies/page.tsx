import type { Metadata } from "next";
import { LEGAL_ENTITY, LEGAL_UPDATED_AT } from "@/lib/legal-entity";
import {
  LegalHeader,
  LegalLayout,
  LegalSection,
  LegalTable,
  LEGAL_A,
  LEGAL_LIST,
  LEGAL_P,
  LEGAL_STRONG,
} from "@/lib/legal-ui";
import ManageCookiesButton from "./ManageCookiesButton";

export const metadata: Metadata = {
  title: "Política de Cookies",
  description:
    "Qué cookies y tecnologías similares usa Franky, para qué sirve cada una, cuánto duran y cómo cambiar tu consentimiento.",
  alternates: { canonical: "/cookies" },
};

const INDICE = [
  ["que-son", "Qué son"],
  ["categorias", "Categorías del panel"],
  ["listado", "Cookies que usamos"],
  ["almacenamiento", "Almacenamiento local"],
  ["gestionar", "Gestionar o retirar el consentimiento"],
  ["navegador", "Desde tu navegador"],
] as const;

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <LegalHeader
        title="Política de Cookies"
        updatedAt={LEGAL_UPDATED_AT}
        intro="Te contamos qué cookies instala Franky, quién las pone, para qué y durante cuánto tiempo. Las que no son necesarias solo se cargan si las aceptas."
      />
      <LegalLayout
        index={INDICE}
        links={[
          { href: "/privacidad", label: "Política de privacidad" },
          { href: "/terminos", label: "Términos de uso" },
          { href: "/aviso-legal", label: "Aviso legal" },
          { href: "/contacto", label: "Contacto" },
        ]}
      >
        <LegalSection id="que-son" n={1} title="Qué son las cookies">
          <p className={LEGAL_P}>
            Las cookies son pequeños archivos que una web guarda en tu navegador. Usamos también tecnologías
            parecidas, como el almacenamiento local del navegador. En esta política las llamamos a todas
            «cookies». Las necesarias para que Franky funcione no requieren tu consentimiento (art. 22.2 LSSI); el
            resto, sí.
          </p>
        </LegalSection>

        <LegalSection id="categorias" n={2} title="Categorías del panel de cookies">
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Necesarias (siempre activas):</strong> mantienen tu sesión, protegen
              la cuenta, recuerdan tu elección de cookies y tus preferencias, y hacen funcionar los pagos. Sin
              ellas Franky no funciona.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Analítica (opcional):</strong> Google Analytics 4 y Metricool. Nos
              dicen qué páginas se visitan y de qué campañas llega la gente, para mejorar Franky. Solo se cargan si
              las activas.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Marketing (opcional):</strong> Google AdSense, cuando hay anuncios
              activos en la web. Sirve para mostrar y medir anuncios, que pueden ser personalizados. Solo se carga
              si lo activas.
            </li>
          </ul>
          <p className={LEGAL_P}>
            «Rechazar» deja solo las necesarias. «Aceptar» activa todas. En «Personalizar» eliges categoría por
            categoría.
          </p>
        </LegalSection>

        <LegalSection id="listado" n={3} title="Cookies que usamos">
          <LegalTable
            caption="Listado de cookies"
            head={["Nombre", "Titular", "Finalidad", "Duración", "Tipo"]}
            rows={[
              [
                "sb-…-auth-token (puede dividirse en .0, .1…)",
                "Franky (Supabase)",
                "Mantener tu sesión iniciada de forma segura",
                "Hasta 400 días, se renueva al usar Franky; se borra al cerrar sesión",
                "Propia · necesaria",
              ],
              [
                "franky_attribution",
                "Franky",
                "Conservar el origen de tu visita mientras vuelves del inicio de sesión con Google o Apple",
                "1 hora",
                "Propia · necesaria para el alta",
              ],
              [
                "growth_explicit_code",
                "Franky",
                "Recordar el código de invitación que escribes al registrarte con Google o Apple",
                "1 hora",
                "Propia · necesaria para el alta",
              ],
              [
                "growth_first_touch, growth_last_touch",
                "Franky",
                "Reconocer el enlace de invitación que usaste, para atribuir tu alta a quien te invitó. Contienen un identificador opaco, no tus datos",
                "30 días",
                "Propia · atribución de invitaciones",
              ],
              [
                "franky_landing_utm",
                "Franky",
                "Saber por qué enlace de campaña de Franky llegaste (por ejemplo, un enlace de un creador)",
                "30 días",
                "Propia · atribución de campañas",
              ],
              [
                "origin_stripe_oauth",
                "Franky",
                "Proteger la conexión de la cuenta de cobros de un organizador con Stripe",
                "15 minutos",
                "Propia · necesaria",
              ],
              [
                "__stripe_mid, __stripe_sid",
                "Stripe",
                "Prevenir el fraude en los pagos (solo en las pantallas de pago)",
                "1 año y 30 minutos",
                "De terceros · necesaria",
              ],
              [
                "_ga, _ga_<ID>",
                "Google (Google Analytics 4)",
                "Distinguir visitantes y sesiones para estadísticas de uso, con la IP anonimizada",
                "2 años",
                "De terceros · analítica, requiere consentimiento",
              ],
              [
                "Cookies y almacenamiento del rastreador de Metricool (be.js)",
                "Metricool",
                "Medir las visitas que llegan desde nuestras campañas en redes sociales",
                "Según el proveedor",
                "De terceros · analítica, requiere consentimiento",
              ],
              [
                "__gads, __gpi, __eoi, IDE",
                "Google (AdSense y DoubleClick)",
                "Mostrar y medir anuncios, y limitar cuántas veces ves el mismo",
                "Entre 6 y 13 meses",
                "De terceros · marketing, requiere consentimiento",
              ],
            ]}
          />
          <p className={LEGAL_P}>
            Si inicias sesión con Google o Apple, esos proveedores usan sus propias cookies en sus páginas. Las
            duraciones de las cookies de terceros las fija cada proveedor y pueden cambiar; consulta las políticas
            de{" "}
            <a href="https://policies.google.com/technologies/cookies?hl=es" target="_blank" rel="noopener noreferrer" className={LEGAL_A}>
              Google
            </a>
            ,{" "}
            <a href="https://stripe.com/es/cookie-settings" target="_blank" rel="noopener noreferrer" className={LEGAL_A}>
              Stripe
            </a>{" "}
            y{" "}
            <a href="https://metricool.com/es/politica-de-cookies/" target="_blank" rel="noopener noreferrer" className={LEGAL_A}>
              Metricool
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection id="almacenamiento" n={4} title="Almacenamiento local del navegador">
          <p className={LEGAL_P}>Además de cookies, Franky guarda en tu navegador:</p>
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>franky_cookie_consent:</strong> tu elección en el panel de cookies y
              su fecha. Necesaria. Se conserva hasta que la cambies o borres los datos del navegador.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>franky_theme y preferencias de interfaz:</strong> tema claro u oscuro,
              aspecto del chat y borradores que aún no has enviado. Necesarias para recordar lo que eliges.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>franky_attribution:</strong> los parámetros de campaña (utm) y la
              página por la que llegaste, para asociarlos a tu alta si te registras. Caduca a los 30 días.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="gestionar" n={5} title="Gestionar o retirar el consentimiento">
          <p className={LEGAL_P}>
            Puedes cambiar tu elección cuando quieras, igual de fácil que la diste. Al retirar la analítica o el
            marketing dejamos de cargar esas herramientas y borramos sus cookies de este navegador.
          </p>
          <ManageCookiesButton />
          <p className={LEGAL_P}>
            Tu elección se guarda en este navegador: si usas otro dispositivo o borras los datos del navegador,
            te volveremos a preguntar. Para cualquier duda, escribe a{" "}
            <a href={`mailto:${LEGAL_ENTITY.email}`} className={LEGAL_A}>{LEGAL_ENTITY.email}</a>.
          </p>
        </LegalSection>

        <LegalSection id="navegador" n={6} title="Desde tu navegador">
          <p className={LEGAL_P}>
            También puedes bloquear o borrar cookies desde la configuración de tu navegador (Chrome, Safari,
            Firefox o Edge). Si bloqueas las necesarias, no podrás iniciar sesión ni pagar en Franky.
          </p>
        </LegalSection>
      </LegalLayout>
    </div>
  );
}
