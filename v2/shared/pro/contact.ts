/** Contacto comercial de Franky Pro. Número de ejemplo en la copia pública: pon el real en tu despliegue. */
export const PRO_CONTACT = {
  phoneLabel: "600 000 000",
  phoneE164: "34600000000",
  email: "contacto@franky.es",
  whatsappHref(message: string) {
    return `https://wa.me/${this.phoneE164}?text=${encodeURIComponent(message)}`;
  },
};
