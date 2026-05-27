const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// react-i18next v17+ distributes ES modules via "exports" field.
// Metro resolves "default" → dist/es which uses .js-extension imports
// that Metro can't follow. Disabling package exports forces Metro to
// use the "main" field (dist/commonjs) instead.
config.resolver.unstable_enablePackageExports = false

module.exports = config
