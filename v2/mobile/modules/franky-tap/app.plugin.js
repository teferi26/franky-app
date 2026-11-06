// ─── Plugin de Franky Tap ───────────────────────────────────────────────────
// Añade al proyecto de iOS los textos de permiso y los servicios de red local
// que exige el sistema. Sin ellos la aplicación se cierra en cuanto intenta
// buscar teléfonos cerca, y la revisión de la App Store la rechaza por pedir
// acceso sin explicar para qué.
//
// Android no necesita nada aquí: los permisos van en el AndroidManifest.xml
// del propio módulo y el sistema de compilación los fusiona solo.
const { withInfoPlist } = require('expo/config-plugins');

// Debe coincidir con la constante SERVICIO del módulo de iOS. Si cambia una,
// hay que cambiar la otra o el sistema bloqueará la búsqueda.
const SERVICIO = 'franky-tap';

const TEXTOS = {
  NSNearbyInteractionUsageDescription:
    'Franky mide la distancia con el teléfono que tienes delante para saber cuándo los acercáis. Solo mientras la pantalla está abierta.',
  NSLocalNetworkUsageDescription:
    'Franky conecta los móviles cercanos cuando ambos activáis Crush Live. La afinidad se calcula de forma privada en Franky mediante internet.',
  NSBluetoothAlwaysUsageDescription:
    'Franky usa el Bluetooth para detectar el teléfono que tienes al lado cuando acercáis los móviles.',
  NSBluetoothPeripheralUsageDescription:
    'Franky usa el Bluetooth para que el teléfono de la otra persona pueda detectarte cuando acercáis los móviles.',
};

module.exports = function withFrankyTap(config) {
  return withInfoPlist(config, (cfg) => {
    for (const [clave, texto] of Object.entries(TEXTOS)) {
      // No pisamos un texto que ya exista: otro plugin puede haberlo puesto y
      // el suyo describe su propio uso.
      if (!cfg.modResults[clave]) cfg.modResults[clave] = texto;
    }

    // Sin declarar los servicios, iOS corta el descubrimiento de Multipeer sin
    // ningún aviso: la búsqueda simplemente no encuentra a nadie.
    const servicios = new Set(cfg.modResults.NSBonjourServices ?? []);
    servicios.add(`_${SERVICIO}._tcp`);
    servicios.add(`_${SERVICIO}._udp`);
    cfg.modResults.NSBonjourServices = Array.from(servicios);

    return cfg;
  });
};
