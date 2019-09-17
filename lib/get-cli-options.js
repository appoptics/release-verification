'use strict'

const optimist = require('optimist')

const optimistOptions = {
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
    boolean: true,
  },
  'X': {
    alias: 'exclude-dir',
    describe: 'full path from unpacked directory to exclude [multiple allowed]',
  },
  'x': {
    alias: 'exclude-file',
    describe: 'file, including path, to exclude [multiple allowed]'
  },
  'p': {
    alias: 'include-prerelease',
    describe: 'match pre-release tags (-rc1, etc.) in ranges',
    default: false,
    boolean: true,
  },
  'S': {
    alias: 'source',
    describe: 'the user/repository in github. required for packages missing or with without source information',
    default: '',
  },
  'W': {
    alias: 'no-warn',
    describe: 'suppress warning messages',
    default: false,
    boolean: true,
  },
  'c': {
    alias: 'config-file',
    describe: 'use a config file for settings',
  },
  'h': {
    alias: 'help',
    showHelp: undefined,
  }
};

function getOptions (options = {}) {
  let defaults = {};
  let errors;
  if (options.configFile) {
    // ask optimist for the config file option only.
    const configOpt = optimist.options(
      {[options.configFile.key]: {alias: options.configFile.alias}}
    ).argv;

    const configFile = configOpt[options.configFile.key];
    if (configFile) {
      try {
        defaults = require(configFile);
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') {
          errors = [`config file ${configFile} not found`];
        } else {
          errors = [`config file error ${e.message} (${e.code})`];
        }
      }
    }
  }
  Object.keys(optimistOptions).forEach(k => {
    const camelKey = toCamel(k);
    const camelAlias = optimistOptions[k].alias && toCamel(optimistOptions[k].alias);
    if (camelKey in defaults) {
      optimistOptions[k].default = defaults[camelKey];
    } else if (camelAlias && camelAlias in defaults) {
      optimistOptions[k].default = defaults[camelAlias];
    }
  })
  const cliOptions = optimist
    .usage('node verify package-name [options]')
    .options(optimistOptions)
    .argv;

  // fix up options with embedded dashes
  const keys = Object.keys(cliOptions).filter(k => k.match(/[^-]+-[^-]+/));
  for (const k of keys) {
    cliOptions[toCamel(k)] = cliOptions[k];
    delete cliOptions[k];
  }

  return {cliOptions, showHelp: optimist.showHelp, errors};
}

module.exports = getOptions;

//
// helpers
//
const toCamel = s => {
  return s.replace(/([-][a-z])/ig, $1 => {
    return $1.toUpperCase()
      .replace('-', '');
  });
};

//
// simple tester
//
if (!module.parent) {
  const cliOptions = getOptions();
  if (cliOptions.help) {
    optimist.showHelp();
  } else {
    // eslint-disable-next-line no-console
    console.log(cliOptions);
  }
}
