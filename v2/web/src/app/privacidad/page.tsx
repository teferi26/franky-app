import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_ENTITY, LEGAL_UPDATED_AT, legalEntityLines } from "@/lib/legal-entity";
import {
  LegalHeader,
  LegalLayout,
  LegalSection,
  LegalTable,
  LEGAL_A,
  LEGAL_H3,
  LEGAL_LIST,
  LEGAL_P,
  LEGAL_STRONG,
} from "@/lib/legal-ui";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description:
    "Cómo trata Franky tus datos personales: responsable, finalidades y base legal, datos que usamos, proveedores, transferencias, plazos de conservación y tus derechos.",
  alternates: { canonical: "/privacidad" },
};

// Índice lateral: mismos títulos que las secciones de abajo.
const INDICE = [
  ["responsable", "Responsable"],
  ["datos", "Datos que tratamos"],
  ["finalidades", "Finalidades y base legal"],
  ["perfilado", "Perfilado y decisiones automatizadas"],
  ["destinatarios", "Destinatarios y proveedores"],
  ["transferencias", "Transferencias internacionales"],
  ["conservacion", "Conservación"],
  ["menores", "Edad mínima"],
  ["derechos", "Tus derechos"],
  ["reclamacion", "Reclamaciones"],
  ["cambios", "Cambios"],
] as const;

const EMAIL = LEGAL_ENTITY.email;

function Mail() {
  return (
    <a href={`mailto:${EMAIL}`} className={LEGAL_A}>
      {EMAIL}
    </a>
  );
}

export default function PrivacidadPage() {
  const lines = legalEntityLines();
  return (
    <div className="min-h-screen bg-bg-primary">
      <LegalHeader
        title="Política de Privacidad"
        updatedAt={LEGAL_UPDATED_AT}
        intro="Te explicamos qué datos usamos, para qué, con quién los compartimos y cómo ejercer tus derechos. Aplica a la web franky.es y a la app móvil Franky."
      />
      <LegalLayout
        index={INDICE}
        links={[
          { href: "/terminos", label: "Términos de uso" },
          { href: "/cookies", label: "Política de cookies" },
          { href: "/aviso-legal", label: "Aviso legal" },
          { href: "/contacto", label: "Contacto" },
        ]}
      >
        <LegalSection id="responsable" n={1} title="Responsable del tratamiento">
          <p className={LEGAL_P}>El responsable de los datos personales que se tratan en Franky es:</p>
          <ul className={LEGAL_LIST}>
            {lines.map((row) => (
              <li key={row.label} className="py-3">
                <strong className={LEGAL_STRONG}>{row.label}:</strong>{" "}
                {row.label === "Correo electrónico" ? <Mail /> : row.value}
              </li>
            ))}
          </ul>
          <p className={LEGAL_P}>
            Para cualquier cuestión sobre privacidad escríbenos a <Mail />. Más datos del titular en el{" "}
            <Link href="/aviso-legal" className={LEGAL_A}>aviso legal</Link>.
          </p>
        </LegalSection>

        <LegalSection id="datos" n={2} title="Datos que tratamos">
          <p className={LEGAL_P}>
            Solo tratamos los datos que nos das o que se generan al usar Franky. Muchos son opcionales: si no los
            rellenas, la función que los necesita simplemente no se activa.
          </p>
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Cuenta:</strong> nombre, correo electrónico, contraseña (se guarda
              cifrada con un hash, nunca en claro), método de acceso (correo, Google o Apple) y foto de perfil.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Perfil:</strong> fecha de nacimiento (para comprobar la edad y
              mostrarte gente de tu edad; nunca publicamos la fecha exacta), género, comunidad autónoma y ciudad,
              etapa de estudios, universidad, carrera y curso, carrera o ciudad que te interesan, biografía y
              aficiones.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Verificación de estudiante:</strong> el correo de tu universidad y
              la confirmación de que es tuyo.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Roomie y alojamiento:</strong> si buscas piso o compañero, tus
              hábitos y preferencias de convivencia (tabaco, fiesta, horarios, estudio, limpieza, ruido, visitas,
              mascotas, alimentación, convivir con personas de otro género), presupuesto y respuestas del
              cuestionario de compatibilidad.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Crush:</strong> tu usuario de Instagram (solo lo ve otra persona
              cuando hay interés mutuo), tu participación, los likes y solicitudes que envías o recibes y, en
              Crush Live, los géneros de las personas que te interesa conocer.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Contenido y mensajes:</strong> publicaciones, comentarios, encuestas,
              historias, fotos, vídeos y audios que subes, mensajes privados, denuncias y bloqueos.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Ubicación:</strong> solo si das permiso en el navegador o la app,
              para centrar el mapa y calcular rutas a eventos y sitios. No la guardamos en tu perfil. Si creas un
              evento, guardamos la dirección y las coordenadas del evento, no las tuyas.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Dispositivo y avisos:</strong> el identificador de notificaciones
              push de tu móvil, la plataforma y la versión de la app, y tus preferencias de avisos.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Pagos:</strong> importe, concepto, estado e identificadores de la
              operación en Stripe. Los datos de tu tarjeta los trata directamente Stripe: Franky no los recibe ni
              los guarda. Si cobras a través de Franky (organizadores, vendedores del mercado), Stripe te pedirá
              los datos de identidad y bancarios que exige la normativa de pagos.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Propietarios, locales y organizaciones:</strong> nombre comercial,
              teléfono de contacto, ciudad, anuncios y datos de facturación.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Origen de tu visita:</strong> parámetros de campaña (utm), la página
              por la que llegaste, la web de procedencia y, si usas un enlace o código de invitación, ese código.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Uso del servicio:</strong> eventos de producto con sesión iniciada
              (pantallas vistas, pasos del registro, acciones como publicar o guardar), sin textos que escribas.
              Con tu consentimiento, además, Google Analytics y Metricool (ver{" "}
              <Link href="/cookies" className={LEGAL_A}>cookies</Link>).
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Seguridad y soporte:</strong> dirección IP y registros técnicos para
              prevenir abusos (limitamos intentos usando un valor cifrado de la IP o del correo), informes de
              errores de la app sin datos personales y los mensajes que nos envías por el formulario de contacto.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Asistente con IA:</strong> las preguntas que escribes en el
              asistente de Franky o en BecarIA (ver apartado 5).
            </li>
          </ul>
          <p className={LEGAL_P}>
            <strong className={LEGAL_STRONG}>Datos especialmente protegidos.</strong> Indicar en Crush Live qué
            géneros te interesan puede revelar tu orientación sexual. Solo tratamos ese dato si decides usar Crush
            Live, con tu consentimiento explícito (art. 9.2.a RGPD), y solo para emparejarte en ese evento. Puedes
            retirarlo en cualquier momento dejando de participar. No pedimos ningún otro dato de esta categoría:
            no escribas datos de salud, religión, ideología u orientación sexual en publicaciones o mensajes.
          </p>
        </LegalSection>

        <LegalSection id="finalidades" n={3} title="Finalidades y base legal">
          <p className={LEGAL_P}>Cada uso de tus datos tiene una base legal del artículo 6 del RGPD:</p>
          <LegalTable
            caption="Finalidades del tratamiento y su base legal"
            head={["Para qué", "Datos", "Base legal"]}
            rows={[
              [
                "Crear y gestionar tu cuenta, iniciar sesión y darte soporte",
                "Cuenta, seguridad y soporte",
                "Ejecución del contrato (art. 6.1.b), es decir, los Términos de uso que aceptas al registrarte",
              ],
              [
                "Comprobar tu edad (14 años para la cuenta, 18 para Crush)",
                "Fecha de nacimiento",
                "Obligación legal (art. 6.1.c, en relación con el art. 7 LOPDGDD) y contrato",
              ],
              [
                "Unirte a la comunidad de tu universidad, verificarte como estudiante y personalizar lo que ves (becas, notas de corte, planes)",
                "Perfil y verificación de estudiante",
                "Ejecución del contrato (art. 6.1.b)",
              ],
              [
                "Calcular tu compatibilidad con posibles compañeros de piso y mostrarte pisos",
                "Roomie y alojamiento",
                "Ejecución del contrato (art. 6.1.b), a petición tuya al activar la búsqueda",
              ],
              [
                "Crush: mostrarte a otras personas y compartir tu Instagram cuando hay interés mutuo",
                "Crush",
                "Consentimiento (art. 6.1.a), que das al activar Crush; para los géneros de Crush Live, consentimiento explícito (art. 9.2.a)",
              ],
              [
                "Publicar contenido, chatear y moderar la comunidad para prevenir abusos",
                "Contenido y mensajes",
                "Ejecución del contrato (art. 6.1.b) e interés legítimo en mantener una comunidad segura (art. 6.1.f)",
              ],
              [
                "Cobros, entradas, suscripciones, facturas y devoluciones",
                "Pagos, propietarios y organizaciones",
                "Ejecución del contrato (art. 6.1.b) y obligaciones legales contables y fiscales (art. 6.1.c)",
              ],
              [
                "Avisos por correo y notificaciones push sobre tu actividad",
                "Cuenta, dispositivo y avisos",
                "Ejecución del contrato (art. 6.1.b). Las notificaciones push requieren tu permiso en el móvil y puedes desactivarlas",
              ],
              [
                "Saber qué campaña o invitación te trajo y reconocer al usuario que te invitó",
                "Origen de tu visita",
                "Interés legítimo en medir nuestras campañas y el programa de invitaciones (art. 6.1.f)",
              ],
              [
                "Analítica de producto propia para mejorar Franky",
                "Uso del servicio (eventos de producto)",
                "Interés legítimo en mejorar el servicio (art. 6.1.f). Puedes oponerte escribiéndonos",
              ],
              [
                "Analítica de terceros (Google Analytics, Metricool) y publicidad (Google AdSense)",
                "Cookies y datos del navegador",
                "Consentimiento (art. 6.1.a y art. 22.2 LSSI), que das en el panel de cookies",
              ],
              [
                "Responder preguntas con el asistente de IA",
                "Asistente con IA",
                "Ejecución del contrato (art. 6.1.b), a petición tuya al usar el asistente",
              ],
              [
                "Prevenir fraude y abusos, y defendernos ante reclamaciones",
                "Seguridad, registros de moderación",
                "Interés legítimo (art. 6.1.f) y obligaciones legales (art. 6.1.c)",
              ],
            ]}
          />
          <p className={LEGAL_P}>
            Cuando la base es el consentimiento, puedes retirarlo en cualquier momento (desactivando Crush o
            cambiando tus preferencias de cookies) sin que afecte a lo tratado antes. Cuando es el interés
            legítimo, puedes oponerte escribiendo a <Mail />.
          </p>
        </LegalSection>

        <LegalSection id="perfilado" n={4} title="Perfilado y decisiones automatizadas">
          <p className={LEGAL_P}>Algunas funciones ordenan o sugieren personas a partir de tus respuestas:</p>
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Roomie:</strong> calculamos un porcentaje de compatibilidad
              comparando tus respuestas de convivencia y presupuesto con las de otras personas. Sirve para ordenar
              sugerencias; tú decides con quién hablas.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Crush y Crush Live:</strong> mostramos personas de tu entorno
              universitario o del evento, mayores de 18, que también participan, según tus preferencias. Solo hay
              contacto si el interés es mutuo.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Moderación:</strong> un sistema automático (Google Gemini) revisa
              publicaciones, encuestas e imágenes antes de mostrarlas y puede retener las dudosas para que las
              revise una persona del equipo. Puedes pedir revisión humana de cualquier decisión desde el
              formulario de contacto.
            </li>
          </ul>
          <p className={LEGAL_P}>
            Ninguna de estas funciones toma decisiones con efectos jurídicos sobre ti ni te afecta de forma
            similarmente significativa en el sentido del artículo 22 del RGPD. Aun así, puedes pedirnos
            información sobre la lógica aplicada y oponerte a ella.
          </p>
        </LegalSection>

        <LegalSection id="destinatarios" n={5} title="Destinatarios y proveedores">
          <p className={LEGAL_P}>
            No vendemos tus datos. Los comparten contigo otras personas usuarias solo en lo que tú haces público
            (perfil de comunidad, publicaciones, anuncios). Además, estos proveedores tratan datos por cuenta de
            Franky como encargados del tratamiento, con contrato y solo para prestarnos el servicio:
          </p>
          <LegalTable
            caption="Proveedores que tratan datos por cuenta de Franky"
            head={["Proveedor", "Para qué", "Ubicación"]}
            rows={[
              ["Supabase", "Base de datos, autenticación y almacenamiento de archivos", "UE o EE. UU., según la región del servicio"],
              ["Vercel", "Alojamiento de la web y entrega de contenidos", "EE. UU. y red global"],
              ["Stripe", "Cobros, suscripciones, pagos a organizadores y devoluciones", "Irlanda (UE) y EE. UU."],
              ["Resend", "Envío de correos de la cuenta y de actividad", "EE. UU."],
              ["Upstash", "Límites de intentos contra abusos (con valores cifrados)", "Según la región del servicio"],
              ["Google (Gemini)", "Moderación automática de publicaciones e imágenes", "EE. UU. y UE"],
              ["DeepSeek", "Respuestas del asistente con IA y de BecarIA", "China"],
              ["Expo (650 Industries)", "Entrega de notificaciones push de la app", "EE. UU."],
              ["Sentry", "Informes de errores de la app, sin datos personales", "EE. UU."],
              ["Google Analytics y Google AdSense", "Analítica y anuncios, solo con tu consentimiento", "EE. UU. y UE"],
              ["Metricool", "Analítica de campañas, solo con tu consentimiento", "España (UE)"],
              ["OSRM (servicio público de rutas)", "Calcular la ruta cuando la pides, con tu ubicación y el destino", "UE"],
            ]}
          />
          <p className={LEGAL_P}>
            <strong className={LEGAL_STRONG}>Asistente con IA.</strong> Si usas las respuestas con IA de Franky o
            BecarIA, enviamos a DeepSeek tu pregunta, un contexto limitado de preguntas recientes y la
            información pública necesaria para responder. No adjuntamos tu perfil, identificador de cuenta,
            conversaciones privadas, pagos ni las respuestas del formulario de orientación de becas. Evita escribir
            datos personales: la eliminación automática de algunos identificadores no garantiza detectarlos todos.
            Franky no guarda este chat; permanece en la pantalla hasta que recargas o cambias de cuenta. La guía
            rápida funciona sin enviar preguntas a DeepSeek.
          </p>
          <p className={LEGAL_P}>
            <strong className={LEGAL_STRONG}>Moderación.</strong> Enviamos a Google Gemini el contenido necesario
            para evaluarlo; las publicaciones anónimas no incluyen tu identificador interno de cuenta. Conservamos
            un registro restringido de las decisiones y denuncias para atender reclamaciones.
          </p>
          <h3 className={LEGAL_H3}>Otros destinatarios</h3>
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Inicio de sesión con Google o Apple:</strong> si lo eliges, ese
              proveedor nos confirma tu identidad y tu correo según su propia política de privacidad.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Organizadores y vendedores:</strong> si compras una entrada o algo
              en el mercado, quien vende recibe los datos necesarios para entregarte lo comprado y gestionar el
              acceso o la devolución.
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Stripe como responsable:</strong> para prevenir fraude y cumplir la
              normativa de pagos, Stripe trata algunos datos por su cuenta según su{" "}
              <a href="https://stripe.com/es/privacy" target="_blank" rel="noopener noreferrer" className={LEGAL_A}>
                política de privacidad
              </a>
              .
            </li>
            <li className="py-3">
              <strong className={LEGAL_STRONG}>Autoridades:</strong> jueces, fuerzas de seguridad, Agencia
              Tributaria u otras autoridades cuando una ley nos obligue.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="transferencias" n={6} title="Transferencias internacionales">
          <p className={LEGAL_P}>
            Algunos proveedores tratan datos fuera del Espacio Económico Europeo. En esos casos la transferencia
            se ampara en la decisión de adecuación de la Comisión Europea sobre el Marco de Privacidad de Datos
            UE-EE. UU., cuando el proveedor está certificado en él, o en las cláusulas contractuales tipo aprobadas
            por la Comisión Europea (art. 46.2.c RGPD), junto con las medidas adicionales que correspondan.
          </p>
          <p className={LEGAL_P}>
            China no cuenta con una decisión de adecuación. Por eso a DeepSeek solo enviamos la pregunta y
            contexto público, sin identificadores de cuenta, y solo cuando usas el asistente. Si no quieres que tu
            pregunta salga del Espacio Económico Europeo, usa la guía rápida, que no la envía.
          </p>
          <p className={LEGAL_P}>Puedes pedir copia de las garantías aplicables escribiendo a <Mail />.</p>
        </LegalSection>

        <LegalSection id="conservacion" n={7} title="Conservación">
          <LegalTable
            caption="Plazos de conservación por categoría de datos"
            head={["Datos", "Cuánto tiempo"]}
            rows={[
              ["Cuenta, perfil, verificación de estudiante, roomie y Crush", "Mientras tengas la cuenta. Si la borras, se eliminan en un máximo de 30 días"],
              ["Publicaciones, comentarios y mensajes", "Mientras tengas la cuenta o hasta que los borres"],
              ["Notificaciones dentro de la app", "30 días"],
              ["Eventos de analítica de producto", "180 días"],
              ["Enlaces de invitación que no acaban en registro", "31 días. Si te registras, el origen de tu alta se conserva con tu cuenta"],
              ["Franky Tap (acercar móviles)", "Códigos temporales: 1 hora. Registro del encuentro: 30 días"],
              ["Identificador de notificaciones push", "Hasta que desactives los avisos, cierres sesión en ese dispositivo o borres la cuenta"],
              ["Pagos, facturas y datos contables", "6 años desde el cierre del ejercicio (art. 30 del Código de Comercio) y, en lo fiscal, mientras no prescriban las obligaciones tributarias"],
              ["Registros de moderación y denuncias", "Hasta resolver la denuncia o reclamación y, después, bloqueados durante el plazo de prescripción de las acciones que puedan derivarse"],
              ["Chat del asistente con IA", "Franky no lo guarda"],
              ["Cookies y almacenamiento del navegador", "Ver la política de cookies"],
            ]}
          />
          <p className={LEGAL_P}>
            Puedes borrar tu cuenta desde Perfil &gt; Eliminar mi cuenta, en la web o en la app. La solicitud es
            irreversible: se cierra el acceso, se cancelan las renovaciones pendientes y eliminamos tus datos
            personales en un máximo de 30 días; recibirás una confirmación por correo. Solo conservamos, bloqueados
            y con acceso restringido, los registros necesarios para obligaciones legales, operaciones pendientes y
            derechos de otras personas. Las versiones antiguas de la app que indican «Desactivar mi cuenta» solo
            ocultan el perfil: actualiza la app o usa el borrado de la web.
          </p>
        </LegalSection>

        <LegalSection id="menores" n={8} title="Edad mínima">
          <p className={LEGAL_P}>
            Para crear una cuenta en Franky tienes que tener al menos <strong className={LEGAL_STRONG}>14 años</strong>,
            la edad a partir de la cual la ley española permite consentir el tratamiento de tus datos (art. 7
            LOPDGDD). Crush, Crush Live y el contacto con personas que no conoces son solo para{" "}
            <strong className={LEGAL_STRONG}>mayores de 18 años</strong>. Lo comprobamos con la fecha de
            nacimiento de tu perfil.
          </p>
          <p className={LEGAL_P}>
            Si detectamos una cuenta de alguien menor de 14 años, la eliminaremos. Si eres madre, padre o tutor y
            crees que tu hijo o hija menor de 14 años se ha registrado, escríbenos a <Mail />.
          </p>
        </LegalSection>

        <LegalSection id="derechos" n={9} title="Tus derechos">
          <p className={LEGAL_P}>Puedes ejercer en cualquier momento, sin coste, tus derechos de:</p>
          <ul className={LEGAL_LIST}>
            <li className="py-3"><strong className={LEGAL_STRONG}>Acceso:</strong> saber qué datos tuyos tratamos y obtener una copia.</li>
            <li className="py-3"><strong className={LEGAL_STRONG}>Rectificación:</strong> corregir datos inexactos. Casi todo se puede editar desde tu perfil.</li>
            <li className="py-3"><strong className={LEGAL_STRONG}>Supresión:</strong> borrar tus datos, también desde Perfil &gt; Eliminar mi cuenta.</li>
            <li className="py-3"><strong className={LEGAL_STRONG}>Oposición:</strong> a los tratamientos basados en interés legítimo, incluida la analítica propia.</li>
            <li className="py-3"><strong className={LEGAL_STRONG}>Limitación:</strong> pedir que conservemos tus datos sin usarlos mientras se resuelve una reclamación.</li>
            <li className="py-3"><strong className={LEGAL_STRONG}>Portabilidad:</strong> recibir los datos que nos diste en un formato estructurado.</li>
            <li className="py-3"><strong className={LEGAL_STRONG}>Retirar el consentimiento:</strong> desactivando Crush o cambiando tus preferencias de cookies.</li>
            <li className="py-3"><strong className={LEGAL_STRONG}>No ser objeto de decisiones automatizadas</strong> con efectos jurídicos o significativos, y pedir intervención humana.</li>
          </ul>
          <p className={LEGAL_P}>
            Escríbenos a <Mail /> desde el correo de tu cuenta indicando qué derecho quieres ejercer. Si escribes
            desde otra dirección, podremos pedirte lo mínimo necesario para confirmar tu identidad. Responderemos
            en el plazo de un mes, ampliable dos meses más en casos complejos, avisándote antes.
          </p>
        </LegalSection>

        <LegalSection id="reclamacion" n={10} title="Reclamaciones">
          <p className={LEGAL_P}>
            Si crees que no hemos tratado bien tus datos, puedes presentar una reclamación ante la Agencia
            Española de Protección de Datos (AEPD) en{" "}
            <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className={LEGAL_A}>
              aepd.es
            </a>
            . Te agradeceremos que antes nos escribas a <Mail /> para intentar resolverlo.
          </p>
        </LegalSection>

        <LegalSection id="cambios" n={11} title="Cambios en esta política">
          <p className={LEGAL_P}>
            Si cambiamos esta política de forma relevante te avisaremos por correo o dentro de Franky antes de
            que el cambio se aplique. La fecha de la última actualización aparece arriba.
          </p>
        </LegalSection>
      </LegalLayout>
    </div>
  );
}
