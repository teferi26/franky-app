import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_ENTITY, LEGAL_UPDATED_AT, SUPPORT_EMAIL, legalEntityLines } from "@/lib/legal-entity";
import { LegalHeader, LegalLayout, LegalSection, LEGAL_A, LEGAL_LIST, LEGAL_P, LEGAL_STRONG } from "@/lib/legal-ui";

export const metadata: Metadata = {
  title: "Aviso legal",
  description:
    "Aviso legal de Franky: titular del servicio, datos de contacto, condiciones de uso de la web, propiedad intelectual y legislación aplicable.",
  alternates: { canonical: "/aviso-legal" },
};

const INDICE = [
  ["titular", "Titular del servicio"],
  ["objeto", "Objeto"],
  ["condiciones", "Condiciones de uso"],
  ["propiedad", "Propiedad intelectual"],
  ["responsabilidad", "Responsabilidad"],
  ["ley", "Ley aplicable"],
] as const;

export default function AvisoLegalPage() {
  const lines = legalEntityLines();
  return (
    <div className="min-h-screen bg-bg-primary">
      <LegalHeader
        title="Aviso legal"
        updatedAt={LEGAL_UPDATED_AT}
        intro="Información general sobre quién presta el servicio de Franky, en cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI)."
      />
      <LegalLayout
        index={INDICE}
        links={[
          { href: "/terminos", label: "Términos de uso" },
          { href: "/privacidad", label: "Política de privacidad" },
          { href: "/cookies", label: "Política de cookies" },
          { href: "/contacto", label: "Contacto" },
        ]}
      >
        <LegalSection id="titular" n={1} title="Titular del servicio">
          <p className={LEGAL_P}>
            Franky (la web franky.es y la aplicación móvil Franky) es un servicio prestado por:
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border text-[15px]">
            {lines.map((row) => (
              <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
                <dt className="text-text-muted">{row.label}</dt>
                <dd className="text-text-primary">
                  {row.label === "Correo electrónico" ? (
                    <a href={`mailto:${row.value}`} className={LEGAL_A}>
                      {row.value}
                    </a>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
            <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
              <dt className="text-text-muted">Soporte</dt>
              <dd className="text-text-primary">
                <a href={`mailto:${SUPPORT_EMAIL}`} className={LEGAL_A}>
                  {SUPPORT_EMAIL}
                </a>{" "}
                o el <Link href="/contacto" className={LEGAL_A}>formulario de contacto</Link>
              </dd>
            </div>
          </dl>
        </LegalSection>

        <LegalSection id="objeto" n={2} title="Objeto">
          <p className={LEGAL_P}>
            Franky es una plataforma para estudiantes de España: información sobre universidades, carreras,
            notas de corte y becas; comunidad de cada universidad (FOMO y Crush); búsqueda de piso y de
            compañeros de piso; eventos y venta de entradas de terceros; mercado entre usuarios; y servicios
            de pago para propietarios, locales y organizaciones.
          </p>
          <p className={LEGAL_P}>
            El uso de las funciones con cuenta se rige además por los{" "}
            <Link href="/terminos" className={LEGAL_A}>Términos de uso</Link>, y el tratamiento de datos por la{" "}
            <Link href="/privacidad" className={LEGAL_A}>Política de privacidad</Link>.
          </p>
        </LegalSection>

        <LegalSection id="condiciones" n={3} title="Condiciones de uso">
          <ul className={LEGAL_LIST}>
            <li className="py-3">
              Puedes navegar por la información pública sin registrarte. Para usar la comunidad, publicar o
              comprar necesitas una cuenta y tener al menos 14 años (18 para Crush).
            </li>
            <li className="py-3">
              Te comprometes a usar Franky de forma lícita, respetuosa y conforme a los Términos de uso: sin
              suplantar a nadie, sin publicar datos de terceros y sin intentar acceder a información ajena.
            </li>
            <li className="py-3">
              No está permitida la extracción automatizada o masiva de contenidos (scraping) ni cualquier
              acción que sobrecargue o dañe la plataforma.
            </li>
            <li className="py-3">
              Las publicaciones de los usuarios son responsabilidad de quien las publica. Si ves contenido
              ilícito, denúncialo desde la propia publicación o escríbenos: lo retiraremos con diligencia en
              cuanto tengamos conocimiento efectivo de él.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="propiedad" n={4} title="Propiedad intelectual">
          <p className={LEGAL_P}>
            El diseño, el código, la marca Franky, los logotipos y los contenidos originales de la plataforma
            pertenecen a su titular o se usan con autorización. No puedes reproducirlos, distribuirlos ni
            transformarlos sin permiso expreso, salvo los usos permitidos por la ley.
          </p>
          <p className={LEGAL_P}>
            Los datos públicos de universidades, notas de corte y becas proceden de fuentes oficiales, que se
            citan cuando corresponde. Las marcas de terceros que aparecen pertenecen a sus titulares.
          </p>
          <p className={LEGAL_P}>
            Conservas los derechos sobre lo que publicas; al publicarlo nos das una licencia gratuita y no
            exclusiva para mostrarlo dentro de Franky mientras siga publicado, en los términos descritos en los{" "}
            <Link href="/terminos" className={LEGAL_A}>Términos de uso</Link>.
          </p>
        </LegalSection>

        <LegalSection id="responsabilidad" n={5} title="Responsabilidad">
          <p className={LEGAL_P}>
            Trabajamos para que la información sea correcta y esté actualizada, pero puede contener errores o
            cambiar sin aviso. Antes de tomar decisiones sobre matrícula, becas o plazos, consulta siempre la
            fuente oficial. Los enlaces a webs externas se ofrecen como ayuda: no controlamos su contenido.
          </p>
        </LegalSection>

        <LegalSection id="ley" n={6} title="Ley aplicable">
          <p className={LEGAL_P}>
            Este aviso se rige por la legislación española. Si eres consumidor, podrás acudir a los juzgados y
            tribunales de tu domicilio. Antes de cualquier reclamación, escríbenos a{" "}
            <a href={`mailto:${LEGAL_ENTITY.email}`} className={LEGAL_A}>{LEGAL_ENTITY.email}</a> y trataremos de
            resolverlo.
          </p>
          <p className={LEGAL_P}>
            <strong className={LEGAL_STRONG}>Consumo:</strong> si eres consumidor en la
            Unión Europea también puedes acudir a los organismos de consumo de tu comunidad autónoma.
          </p>
        </LegalSection>
      </LegalLayout>
    </div>
  );
}
