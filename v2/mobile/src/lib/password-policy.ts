// Política local de alta y cambio de contraseña; la API vuelve a validarla.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export type PasswordIssue = 'tooShort' | 'tooLong' | 'onlySpaces' | 'repetitive';

export function passwordValidationIssue(password: string): PasswordIssue | null {
  if (password.length < PASSWORD_MIN) return 'tooShort';
  if (password.length > PASSWORD_MAX) return 'tooLong';
  if (/^\s+$/.test(password)) return 'onlySpaces';
  if (new Set(password).size < 5) return 'repetitive';
  return null;
}

/** Mensajes conservados para la pantalla de seguridad de la cuenta. */
export function validarPassword(password: string): string | null {
  const issue = passwordValidationIssue(password);
  if (!issue) return null;
  const messages: Record<PasswordIssue, string> = {
    tooShort: `Mínimo ${PASSWORD_MIN} caracteres. Una frase que recuerdes funciona genial.`,
    tooLong: `Máximo ${PASSWORD_MAX} caracteres.`,
    onlySpaces: 'No puede ser solo espacios.',
    repetitive: 'Demasiado repetitiva. Usa más variedad de caracteres.',
  };
  return messages[issue];
}
