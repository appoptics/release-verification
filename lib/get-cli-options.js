'use strict'

const optimist = require('optimist')

const options = optimist
  .usage('node verify package-name [options]')
  .options({
    'r': {
      alias: 'repository',
      describe: 'the repository where the package resides',
      default: 'npm',
    },
    'v': {
      alias: 'versions',
      describe: 'which versions of the agent to verify',
      default: 'latest',
    },
    'i': {
      alias: 'info',
      describe: 'output informational messages',
      default: false,
    },
    'd': {
      alias: 'differences',
      describe: 'differences to show: [all, important]',
      default: 'important'
    },
    /*
    'f': {
      alias: 'framework',
      describe: 'framework to use',
      default: 'express',
    },
    'w': {
      alias: 'ws-ip',
      describe: 'host:port to serve pages from',
      default: 'localhost:8088',
    },
    'db-ip': {
      describe: 'host:port to use for mongodb',
      default: 'localhost:27017',
    },
    't': {
      alias: 'trace-mode',
      describe: 'trace-mode value 0 or 1',
      default: 'undefined'
    },
    'c': {
      alias: 'custom',
      describe: 'use a custom name function',
      default: false,
      boolean: true,
    },
    'l': {
      alias: 'logger',
      describe: 'which logger to use (morgan, pino, winston, bunyan) - not all supported for all frameworks',
      default: 'morgan',
    },
    'L': {
      alias: 'log-level',
      describe: 'what to log (all, errors)',
      default: 'errors',
    },
    'r': {
      describe: 'percent of traces to be sampled',
    },
    'rate': {
      describe: 'rate as numerator over 1000000',
    },
    'm': {
      alias: 'metrics',
      describe: 'appoptics token (not service key)',
      default: undefined,
    },
    'd': {
      alias: 'heap-dump',
      describe: 'dump heap data every n minutes',
      default: 0,
    },
    'gc': {
      describe: 'force garbage collection at n minutes intervals',
      default: 0,
    },
    // */
    'h': {
      alias: 'help',
      showHelp: undefined,
    }
  })
  .argv;

module.exports = {options, showHelp: optimist.showHelp};

//
// simple tester
//
if (!module.parent) {
  if (options.help) {
    optimist.showHelp();
  } else {
    // eslint-disable-next-line no-console
    console.log(options);
  }
}
