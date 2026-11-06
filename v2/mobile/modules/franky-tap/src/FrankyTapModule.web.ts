import { registerWebModule, NativeModule } from 'expo';

import type { FrankyTapEvents, TapCapability } from './FrankyTap.types';

// En el navegador no existe ni banda ultraancha ni Bluetooth de fondo con las
// garantías que hace falta, así que el módulo dice que no está disponible y la
// pantalla ofrece el código escaneado, que sí funciona en cualquier sitio.
class FrankyTapWebModule extends NativeModule<FrankyTapEvents> {
  async isAvailable(): Promise<TapCapability> {
    return { available: false, precise: false, reason: 'unsupported_os' };
  }
  async requestPermissions(): Promise<TapCapability> {
    return { available: false, precise: false, reason: 'unsupported_os' };
  }
  async start(_token: string): Promise<void> {}
  async stop(): Promise<void> {}
}

export default registerWebModule(FrankyTapWebModule, 'FrankyTap');
