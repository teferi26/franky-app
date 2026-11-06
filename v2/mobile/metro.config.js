const { getDefaultConfig } = require("expo/metro-config");
// Unsupported bundled-image formats have upstream image-size denial-of-service
// advisories without a released fix. Reject them before their parsers execute.
// PNG/JPEG/WebP/SVG assets and runtime expo-image handling remain supported.
const rejectedTypes = ["icns", "heif", "jxl", "jxl-stream"];
const path = require("node:path");
const { typeHandlers } = require(
  path.join(path.dirname(require.resolve("image-size")), "types/index.js"),
);
for (const type of rejectedTypes) {
  if (!typeHandlers[type])
    throw new Error(`Review image-size mitigation for ${type}`);
  // disableTypes is checked AFTER detection. JXL detection itself parses boxes,
  // so replace its validator as well as rejecting dimension calculation.
  typeHandlers[type] = {
    validate: () => false,
    calculate: () => {
      throw new TypeError(`Unsupported bundled image format: ${type}`);
    },
  };
}
require("image-size").disableTypes(rejectedTypes);
const config = getDefaultConfig(__dirname);
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(__dirname, "../shared"),
];
// El código común usa las dependencias de esta app, sin un segundo node_modules.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths || []),
  path.resolve(__dirname, "node_modules"),
];
module.exports = config;
