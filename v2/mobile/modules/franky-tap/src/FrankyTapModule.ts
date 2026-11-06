import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { FrankyTapEvents, TapCapability } from './FrankyTap.types';

declare class FrankyTapModule extends NativeModule<FrankyTapEvents> {
  /** Qué puede hacer este teléfono, sin pedir todavía ningún permiso. */
  isAvailable(): Promise<TapCapability>;
  /** Pide los permisos que falten y devuelve el estado ya resuelto. */
  requestPermissions(): Promise<TapCapability>;
  /**
   * Empieza a anunciarse con `token` y a buscar a otros. Mientras esté activo
   * el teléfono emite y escucha, así que la pantalla debe llamar a `stop` al
   * salir para no gastar batería.
   */
  start(token: string): Promise<void>;
  /** Deja de anunciarse y de buscar. Idempotente. */
  stop(): Promise<void>;
}

export default requireOptionalNativeModule<FrankyTapModule>('FrankyTap');
