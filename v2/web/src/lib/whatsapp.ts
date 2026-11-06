/**
 * Enlaces de WhatsApp con el mensaje ya escrito.
 *
 * Hasta agosto de 2026 los enlaces eran `https://wa.me/<numero>` pelados: al
 * pulsarlos se abría una conversación en blanco. Para la inmobiliaria, ese
 * mensaje llegaba sin contexto y sin forma de saber que venía de Franky, así
 * que ni sabía de qué piso le hablaban ni podía atribuirnos el contacto. Con el
 * texto puesto, el primer mensaje ya dice piso y procedencia.
 */

/** Deja solo dígitos y un + inicial: wa.me no admite espacios ni guiones. */
function normalizarTelefono(bruto: string): string {
  const limpio = bruto.replace(/[^\d+]/g, "");
  // El + solo vale al principio; wa.me lo prefiere sin él.
  return limpio.replace(/\+/g, "");
}

/**
 * @param telefono  Tal cual lo escribió el anunciante (campo de texto libre).
 * @param titulo    Título del anuncio, para que sepa de cuál se le habla.
 * @param tipo      Qué se está mirando; cambia el sustantivo del mensaje.
 */
export function enlaceWhatsApp(
  telefono: string,
  titulo: string,
  tipo: "piso" | "local" = "piso",
): string | null {
  const numero = normalizarTelefono(telefono);
  // Un número de menos de 6 dígitos no es un teléfono: mejor no ofrecer un
  // enlace que abre WhatsApp con un destinatario inválido.
  if (numero.length < 6) return null;

  const texto = `Hola, he visto en Franky el ${tipo} «${titulo}» y me gustaría más información.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
