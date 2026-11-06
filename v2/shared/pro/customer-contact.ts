/** Un enlace prepara el mensaje; quien lo abre decide si lo envía. */
export function customerWhatsApp(
  phone: string | undefined,
  message: string,
): string | undefined {
  if (!phone || !/^[+\d\s().-]+$/.test(phone)) return undefined;
  let digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("00")) digits = digits.slice(2);
  else if (!phone.trim().startsWith("+") && digits.length === 9)
    digits = `34${digits}`;
  if (digits.length < 10 || digits.length > 15 || digits.startsWith("0"))
    return undefined;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
