'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* eslint-disable */
var request = require('request-promise');
var fs = require('fs');
var fspath = require('path');
var PromisePool = require('es6-promise-pool');
var singleLineLog = require('single-line-log');

var Log = singleLineLog.stdout;

var BASE_SENTRY_URL = 'https://sentry.io/api/0';

var DEFAULT_INCLUDE = /\.js$|\.map$/;
var DEFAULT_TRANSFORM = function DEFAULT_TRANSFORM(filename) {
  return '~/' + filename;
};
var DEFAULT_DELETE_REGEX = /\.map$/;
var DEFAULT_BODY_TRANSFORM = function DEFAULT_BODY_TRANSFORM(version, projects) {
  return { version: version, projects: projects };
};
var DEFAULT_UPLOAD_FILES_CONCURRENCY = Infinity;

module.exports = function () {
  function SentryPlugin(options) {
    _classCallCheck(this, SentryPlugin);

    // The baseSentryURL option was previously documented to have
    // `/projects` on the end. We now expect the basic API endpoint
    // but remove any `/projects` suffix for backwards compatibility.
    var projectsRegex = /\/projects$/;
    if (options.baseSentryURL) {
      if (projectsRegex.test(options.baseSentryURL)) {
        // eslint-disable-next-line no-console
        console.warn("baseSentryURL with '/projects' suffix is deprecated; " + 'see https://github.com/40thieves/webpack-sentry-plugin/issues/38');
        this.baseSentryURL = options.baseSentryURL.replace(projectsRegex, '');
      } else {
        this.baseSentryURL = options.baseSentryURL;
      }
    } else {
      this.baseSentryURL = BASE_SENTRY_URL;
    }

    this.organizationSlug = options.organization || options.organisation;
    this.projectSlug = options.project;
    if (typeof this.projectSlug === 'string') {
      this.projectSlug = [this.projectSlug];
    }
    this.apiKey = options.apiKey;

    this.releaseBody = options.releaseBody || DEFAULT_BODY_TRANSFORM;
    this.releaseVersion = options.release;

    this.include = options.include || DEFAULT_INCLUDE;
    this.exclude = options.exclude;

    this.filenameTransform = options.filenameTransform || DEFAULT_TRANSFORM;
    this.suppressErrors = options.suppressErrors;
    this.suppressConflictError = options.suppressConflictError;
    this.createReleaseRequestOptions = options.createReleaseRequestOptions || options.requestOptions || {};
    if (_typeof(this.createReleaseRequestOptions) === 'object') {
      var createReleaseRequestOptions = this.createReleaseRequestOptions;
      this.createReleaseRequestOptions = function () {
        return createReleaseRequestOptions;
      };
    }
    this.uploadFileRequestOptions = options.uploadFileRequestOptions || options.requestOptions || {};
    if (_typeof(this.uploadFileRequestOptions) === 'object') {
      var uploadFileRequestOptions = this.uploadFileRequestOptions;
      this.uploadFileRequestOptions = function () {
        return uploadFileRequestOptions;
      };
    }
    if (options.requestOptions) {
      // eslint-disable-next-line no-console
      console.warn('requestOptions is deprecated. ' + 'use createReleaseRequestOptions and ' + 'uploadFileRequestOptions instead; ' + 'see https://github.com/40thieves/webpack-sentry-plugin/pull/43');
    }

    this.deleteAfterCompile = options.deleteAfterCompile;
    this.deleteRegex = options.deleteRegex || DEFAULT_DELETE_REGEX;
    this.uploadFilesConcurrency = options.uploadFilesConcurrency || DEFAULT_UPLOAD_FILES_CONCURRENCY;
  }

  _createClass(SentryPlugin, [{
    key: 'apply',
    value: function apply(compiler) {
      var _this = this;

      compiler.hooks.done.tapAsync('SentryPlus', function (stats, cb) {
        var compilation = stats.compilation;

        var errors = _this.ensureRequiredOptions();

        if (errors) {
          return _this.handleErrors(errors, compilation, cb);
        }

        var files = _this.getFiles(compilation);

        if (typeof _this.releaseVersion === 'function') {
          _this.releaseVersion = _this.releaseVersion(compilation.hash);
        }

        if (typeof _this.releaseBody === 'function') {
          _this.releaseBody = _this.releaseBody(_this.releaseVersion, _this.projectSlug);
        }

        return _this.createRelease().then(function () {
          return _this.uploadFiles(files);
        }).then(function () {
          if (_this.deleteAfterCompile) {
            _this.deleteFiles(stats);
          }
        }).then(function () {
          return cb();
        }).catch(function (err) {
          return _this.handleErrors(err, compilation, cb);
        });
      });
    }
  }, {
    key: 'handleErrors',
    value: function handleErrors(err, compilation, cb) {
      var errorMsg = 'Sentry Plugin: ' + err;
      if (this.suppressErrors || this.suppressConflictError && err.statusCode === 409) {
        compilation.warnings.push(errorMsg);
      } else {
        compilation.errors.push(errorMsg);
      }

      cb();
    }
  }, {
    key: 'ensureRequiredOptions',
    value: function ensureRequiredOptions() {
      if (!this.organizationSlug) {
        return new Error('Must provide organization');
      } else if (!this.projectSlug) {
        return new Error('Must provide project');
      } else if (!this.apiKey) {
        return new Error('Must provide api key');
      } else if (!this.releaseVersion) {
        return new Error('Must provide release version');
      } else {
        return null;
      }
    }
  }, {
    key: 'getFiles',
    value: function getFiles(compilation) {
      var _this2 = this;

      return Object.keys(compilation.assets).map(function (name) {
        if (_this2.isIncludeOrExclude(name)) {
          return { name: name, path: fspath.join(compilation.outputOptions.path, name) };
        }
        return null;
      }).filter(function (i) {
        return i;
      });
    }
  }, {
    key: 'isIncludeOrExclude',
    value: function isIncludeOrExclude(filename) {
      var isIncluded = this.include ? this.include.test(filename) : true;
      var isExcluded = this.exclude ? this.exclude.test(filename) : false;

      return isIncluded && !isExcluded;
    }

    // eslint-disable-next-line class-methods-use-this

  }, {
    key: 'combineRequestOptions',
    value: function combineRequestOptions(req, requestOptionsFunc) {
      var requestOptions = requestOptionsFunc(req);
      var combined = Object.assign({}, requestOptions, req);
      if (requestOptions.headers) {
        Object.assign(combined.headers, requestOptions.headers, req.headers);
      }
      if (requestOptions.auth) {
        Object.assign(combined.auth, requestOptions.auth, req.auth);
      }
      return combined;
    }
  }, {
    key: 'createRelease',
    value: function createRelease() {
      return request(this.combineRequestOptions({
        url: this.sentryReleaseUrl() + '/',
        method: 'POST',
        auth: {
          bearer: this.apiKey
        },
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this.releaseBody)
      }, this.createReleaseRequestOptions));
    }
  }, {
    key: 'uploadFiles',
    value: function uploadFiles(files) {
      var _this3 = this;

      var pool = new PromisePool(function () {
        var file = files.pop();
        if (!file) {
          return null;
        }
        return _this3.uploadFileWithRetry(file);
      }, this.uploadFilesConcurrency);
      return pool.start();
    }
  }, {
    key: 'uploadFileWithRetry',
    value: function () {
      var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(obj) {
        var tryCount;
        return regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                tryCount = 0;

              case 1:
                if (!(tryCount < 3)) {
                  _context.next = 16;
                  break;
                }

                _context.prev = 2;
                _context.next = 5;
                return this.uploadFile(obj);

              case 5:
                Log('sentry upload success: ', obj.name);
                return _context.abrupt('break', 16);

              case 9:
                _context.prev = 9;
                _context.t0 = _context['catch'](2);

                if (!(this.suppressErrors || this.suppressConflictError && _context.t0.statusCode === 409)) {
                  _context.next = 13;
                  break;
                }

                return _context.abrupt('break', 16);

              case 13:
                console.warn('sentry upload retry: -->', tryCount++, obj.name);

              case 14:
                _context.next = 1;
                break;

              case 16:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this, [[2, 9]]);
      }));

      function uploadFileWithRetry(_x) {
        return _ref.apply(this, arguments);
      }

      return uploadFileWithRetry;
    }()
  }, {
    key: 'uploadFile',
    value: function uploadFile(_ref2) {
      var path = _ref2.path,
          name = _ref2.name;

      if (!path) return false;
      return request(this.combineRequestOptions({
        url: this.sentryReleaseUrl() + '/' + this.releaseVersion + '/files/',
        method: 'POST',
        auth: {
          bearer: this.apiKey
        },
        headers: {},
        formData: {
          file: fs.createReadStream(path),
          name: this.filenameTransform(name)
        }
      }, this.uploadFileRequestOptions));
    }
  }, {
    key: 'sentryReleaseUrl',
    value: function sentryReleaseUrl() {
      return this.baseSentryURL + '/organizations/' + this.organizationSlug + '/releases';
    }
  }, {
    key: 'deleteFiles',
    value: function deleteFiles(stats) {
      var _this4 = this;

      Object.keys(stats.compilation.assets).filter(function (name) {
        return _this4.deleteRegex.test(name);
      }).forEach(function (name) {
        var existsAt = fspath.join(stats.compilation.outputOptions.path, name);
        if (existsAt) {
          fs.unlinkSync(existsAt);
        }
      });
    }
  }]);

  return SentryPlugin;
}();