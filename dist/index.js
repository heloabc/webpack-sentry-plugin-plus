'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _requestPromise = require('request-promise');

var _requestPromise2 = _interopRequireDefault(_requestPromise);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _es6PromisePool = require('es6-promise-pool');

var _es6PromisePool2 = _interopRequireDefault(_es6PromisePool);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

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

      compiler.plugin('after-emit', function (compilation, cb) {
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
          return cb();
        }).catch(function (err) {
          return _this.handleErrors(err, compilation, cb);
        });
      });

      compiler.plugin('done', function (stats) {
        if (_this.deleteAfterCompile) {
          _this.deleteFiles(stats);
        }
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
          return { name: name, path: compilation.assets[name].existsAt };
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
      return (0, _requestPromise2.default)(this.combineRequestOptions({
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

      var pool = new _es6PromisePool2.default(function () {
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
    value: async function uploadFileWithRetry(obj) {
      var tryCount = 0;
      while (tryCount < 3) {
        try {
          await this.uploadFile(obj);
          console.log('sentry upload success-->', obj.name);
          break;
        } catch (err) {
          if (this.suppressErrors || this.suppressConflictError && err.statusCode === 409) {
            break;
          }
          tryCount++;
        }
      }
    }
  }, {
    key: 'uploadFile',
    value: function uploadFile(_ref) {
      var path = _ref.path,
          name = _ref.name;

      return (0, _requestPromise2.default)(this.combineRequestOptions({
        url: this.sentryReleaseUrl() + '/' + this.releaseVersion + '/files/',
        method: 'POST',
        auth: {
          bearer: this.apiKey
        },
        headers: {},
        formData: {
          file: _fs2.default.createReadStream(path),
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
        var existsAt = stats.compilation.assets[name].existsAt;

        _fs2.default.unlinkSync(existsAt);
      });
    }
  }]);

  return SentryPlugin;
}();