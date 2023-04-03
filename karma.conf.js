/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
module.exports = function (config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    frameworks: ['mocha', 'chai', 'karma-typescript'],

    files: [
      'src/**/*.ts',
      'test/**/*.ts'
    ],

    karmaTypescriptConfig: {
      bundlerOptions: {
        transforms: [
          require("karma-typescript-es6-transform")()
        ]
      },
      reports: {} // Disables the code coverage report
    },

    preprocessors: {
      '**/*.ts': 'karma-typescript' // *.tsx for React Jsx
    },

    reporters: ['mocha', 'karma-typescript'],

    browsers: ['ChromeHeadless'],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the test and exits
    singleRun: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // Mocha
    client: {
      mocha: {
        // increase from default 2s
        timeout: 10000
        // reporter: 'html'
      }
    },

    colors: true
  })
}
