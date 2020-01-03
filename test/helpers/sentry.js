const request = require('request-promise')
const dotenv = require('dotenv')

// Silence logs if .env file is missing (configured through environment
// variables instead)
dotenv.load({ silent: true })

const {
  SENTRY_API_KEY,
  SENTRY_ORGANIZATION,
  SENTRY_PROJECT,
} = process.env

const SENTRY_URL = `${ process.env.SENTRY_URL || 'https://sentry.io/api/0'}/organizations/${SENTRY_ORGANIZATION}` // eslint-disable-line max-len

// console.log(SENTRY_URL, SENTRY_API_KEY, SENTRY_ORGANIZATION, SENTRY_PROJECT)

function cleanUpRelease(releaseVersion) {
  const url = `${SENTRY_URL}/releases/${releaseVersion}/`;
  return () =>
    request({
      url,
      method: 'DELETE',
      auth: {
        bearer: SENTRY_API_KEY,
      },
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        `ERROR CLEANING UP RELEASE!
Release version: ${releaseVersion}
Status: ${err.statusCode}
Error: ${err.error}`,
      )
    })
}

function fetchRelease(version) {
  return request({
    url: `${SENTRY_URL}/releases/${version}/`,
    auth: {
      bearer: SENTRY_API_KEY,
    },
    json: true,
  })
}

function fetchFiles(version) {
  return request({
    url: `${SENTRY_URL}/releases/${version}/files/`,
    auth: {
      bearer: SENTRY_API_KEY,
    },
    json: true,
  })
}

module.exports = {
  SENTRY_API_KEY,
  SENTRY_ORGANIZATION,
  SENTRY_PROJECT,
  cleanUpRelease,
  fetchFiles,
  fetchRelease,
}
