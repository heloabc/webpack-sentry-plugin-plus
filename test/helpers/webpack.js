const path = require('path')
const webpack = require('webpack')

const SentryWebpackPlugin = require('../../src/index')

const { SENTRY_API_KEY, SENTRY_ORGANIZATION, SENTRY_PROJECT } = require('./sentry')

const OUTPUT_PATH = path.resolve(__dirname, '../../.tmp')

function createWebpackConfig(sentryConfig, webpackConfig) {
  return Object.assign(
    {},
    {
      mode: 'none',
      devtool: 'source-map',
      entry: {
        index: path.resolve(__dirname, '../fixtures/index.js'),
      },
      output: {
        path: OUTPUT_PATH,
        filename: '[name].bundle.js',
      },
      plugins: [configureSentryPlugin(sentryConfig)],
    },
    webpackConfig,
  )
}

function configureSentryPlugin(config) {
  const options = Object.assign(
    {},
    {
      organization: SENTRY_ORGANIZATION,
      project: SENTRY_PROJECT,
      apiKey: SENTRY_API_KEY,
    },
    config,
  )

  return new SentryWebpackPlugin(options)
}

function runWebpack(config) {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      console.log('webpack cb')
      if (stats.toJson().errors.length) {
        reject({ errors: stats.toJson().errors })
      }
      if (stats.toJson().warnings.length) {
        reject({ warnings: stats.toJson().warnings })
      }
      else {
        console.log('resolve')
        resolve({ config, stats })
      }
    })
  })
}

module.exports = {
  OUTPUT_PATH,
  createWebpackConfig,
  runWebpack,
}
