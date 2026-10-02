const { PHASE_DEVELOPMENT_SERVER } = require("next/constants")

/** @type {import('next').NextConfig} */
const baseConfig = {
  staticPageGenerationTimeout: 300,
}

/** @type {import('next').NextConfig} */
function withWebpack(config) {
  return {
    ...config,
    webpack(webpackConfig, { dev }) {
      // OneDrive can race webpack's atomic pack-file renames inside the cache.
      // Keep development caching in memory; production keeps Next's default.
      if (dev) {
        webpackConfig.cache = { type: "memory" }
      }

      return webpackConfig
    },
  }
}

module.exports = (phase) =>
  withWebpack({
    ...baseConfig,
    // Isolate the live dev server from `next build` so the two processes never
    // rewrite the same OneDrive-backed manifests at the same time.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  })
