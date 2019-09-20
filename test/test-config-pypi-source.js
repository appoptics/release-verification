'use strict';

module.exports = {
  source: 'librato/python-appoptics',
  excludeFile: [
    'appoptics_apm.egg-info',
    'PKG-INFO',
    'setup.cfg'
  ],
  excludeDir: [
    'appoptics_apm/swig'
  ],
  noWarn: true,
}
