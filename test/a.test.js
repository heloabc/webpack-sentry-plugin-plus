const fs = require('fs')
const path = require('path')

const { cleanUpRelease, fetchRelease, fetchFiles } = require('./helpers/sentry')
const { createWebpackConfig, runWebpack, OUTPUT_PATH } = require('./helpers/webpack')
const {
  expectNoFailure,
  expectReleaseContainsFile,
  expectReleaseDoesNotContainFile,
} = require('./helpers/assertion')

const release = new Date().getTime();

runWebpack(createWebpackConfig({
  baseSentryURL: process.env.SENTRY_URL,
  release,
  // suppressConflictError: true
  // timeout: 10
})).then(cleanUpRelease(release))

// 

// fetchRelease(123)
