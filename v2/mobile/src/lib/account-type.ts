import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cómo va a usar Franky quien se acaba de registrar. Se guarda en el móvil
 * por cuenta: decide si tras entrar va a la parte de estudiantes o a Franky
 * Pro, sin volver a preguntar en cada inicio de sesión.
 */
export type AccountType = 'estudiante' | 'ocio' | 'vivienda' | 'comunidad' | 'universidad';

const key = (userId: string) => `franky-account-type:${userId}:v1`;

export async function getAccountType(userId: string): Promise<AccountType | null> {
  try {
    const value = await AsyncStorage.getItem(key(userId));
    return value === 'estudiante' || value === 'ocio' || value === 'vivienda' || value === 'comunidad' || value === 'universidad' ? value : null;
  } catch {
    return null;
  }
}

export async function setAccountType(userId: string, type: AccountType): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), type);
  } catch {
    // Si no se puede guardar, se volverá a preguntar la próxima vez.
  }
}

export function isBusinessType(type: AccountType | null): boolean {
  return type !== null && type !== 'estudiante';
}
