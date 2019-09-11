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
      boolean: true,
    },
    'd': {
      alias: 'differences',
      describe: 'differences to show: [all, important]',
      default: 'important'
    },
    's': {
      alias: 'simulate',
      describe: 'don\'t actually execute the steps but output info',
      default: false,
      boolean: true,
    },
    'x': {
      alias: 'exclude',
      describe: 'full path from unpacked directory to ignore [multiple allowed]',
    },
    'p': {
      alias: 'include-prerelease',
      describe: 'match pre-release tags (-rc1, etc.) in ranges',
      default: false,
      boolean: true,
    },
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
