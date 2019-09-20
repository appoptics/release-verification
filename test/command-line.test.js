'use strict';

const exec = require('child_process').exec;
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-string'));

const packageJson = require('../package.json');

describe('command-line tests', function () {
  this.timeout(10000);

  it('should verify that the latest version is correct', function () {
    // allow testing a previous "latest" version if the local version has been bumped.
    const testVersion = process.env.RV_TEST_VERSION || packageJson.version;
    return execute('./verify.js release-verification')
      .then(r => {
        const {exitCode, error, stdout, stderr} = r;
        expect(exitCode).equal(0, 'exit code should be 0');
        expect(error).equal(null);
        expect(stdout).equal(`\n✓ no important differences ${testVersion}\ndone\n`);
        expect(stderr).equal('% no repository information for version 1.0.0\n');
        return error;
      });
  });

  it('should suppress warnings if requested', function () {
    return execute('./verify.js release-verification -v 2.0.0 -W')
      .then(r => {
        const {exitCode, error, stdout, stderr} = r;
        expect(exitCode).equal(0, 'exit code should be 0');
        expect(error).equal(null);
        expect(stdout).equal('\n✓ no important differences 2.0.0\ndone\n');
        expect(stderr).equal('');
        return error;
      });
  });

  it('should verify a specific version with no differences', function () {
    return execute('./verify.js release-verification -W -v 2.0.0')
      .then(r => {
        const {exitCode, error, stdout, stderr} = r;
        expect(exitCode).equal(0, 'exit code should be 0');
        expect(error).equal(null);
        expect(stdout).equal('\n✓ no important differences 2.0.0\ndone\n');
        expect(stderr).equal('');
        return error;
      });
  });

  it('should verify a specific version with differences', function () {
    return execute('./verify.js release-verification -W -v 1.0.1')
      .then(r => {
        return new Error('should not return non-error');
      })
      .catch(e => {
        const {exitCode, error, stdout, stderr} = e;
        expect(exitCode).equal(1, 'exit code should be 1');
        expect(error.message).startsWith('Command failed: ./verify.js release-verification -W -v 1.0.1');
        expect(stdout).equal('\ndifferences\n');
        expect(stderr).equal('? important differences for 1.0.1:\nOnly in pkg-unpacked/lib: pypi-verifier.js\n');
      })
  });

  it('should fail for a version with no repository information', function () {
    return execute('./verify.js release-verification -W -v 1.0.0')
      .then(r => {
        return new Error('should not return non-error');
      })
      .catch(e => {
        const {exitCode, error, stdout, stderr} = e;
        expect(exitCode).equal(1, 'exit code should be 1');
        expect(error.message).startsWith('Command failed: ./verify.js release-verification -W -v 1.0.0\n');
        expect(stdout).equal('\ndifferences\n');
        expect(stderr).equal('? ENOENT - no repository information for release-verification v1.0.0\n');
      });
  });

  it('should allow specifying the repository', function () {
    return execute('./verify.js release-verification -W -v 1.0.0 -S appoptics/release-verification')
      .then(r => {
        const {exitCode, error, stdout, stderr} = r;
        expect(exitCode).equal(0, 'exit code should be 0');
        expect(error).equal(null);
        expect(stdout).equal('\n✓ no important differences 1.0.0\ndone\n');
        expect(stderr).equal('');
      });
  });

  it('should allow specifying a version range', function () {
    const cmd = './verify.js release-verification -v \'>= 1.0.0 < 3.0.0\'';
    return execute(cmd)
      .then(r => {
        return new Error('should not return non-error');
      })
      .catch(e => {
        const {exitCode, error, stdout, stderr} = e;
        const xstdout = ['', '✓ no important differences 2.0.0', 'differences', ''].join('\n')
        const xstderr = [
          '% no repository information for version 1.0.0',
          '? ENOENT - no repository information for release-verification v1.0.0',
          '? important differences for 1.0.1:',
          'Only in pkg-unpacked/lib: pypi-verifier.js',
          ''].join('\n');
        expect(exitCode).equal(1, 'exit code should be 1');
        expect(error.message).startsWith(`Command failed: ${cmd}`);
        expect(stdout).equal(xstdout);
        expect(stderr).equal(xstderr);
      })
  });

  it('should work with rubygems', function () {
    return execute('./verify.js -r rubygems appoptics_apm -W')
      .then(r => {
        return new Error('should not return non-error');
      })
      .catch(e => {
        const {exitCode, error, stdout, stderr} = e;
        const xstderr = [
          '? important differences for 4.9.0:',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: bson',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe_debug.h',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe.h',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe.hpp',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe_wrap.cxx',
          ''
        ].join('\n');

        expect(exitCode).equal(1, 'exit code should be 1');
        expect(error.message).startsWith('Command failed: ./verify.js -r rubygems appoptics_apm -W');
        expect(stdout).equal('\ndifferences\n');
        expect(stderr).equal(xstderr);
      })
  })

  it('should allow excluding a directory', function () {
    return execute('./verify.js -r rubygems appoptics_apm -v 4.9.0 -W -X ext/oboe_metal/src')
      .then(r => {
        const {exitCode, error, stdout, stderr} = r;
        expect(exitCode).equal(0, 'exit code should be 0');
        expect(error).equal(null);
        expect(stdout).equal('\n✓ no important differences 4.9.0\ndone\n');
        expect(stderr).equal('');
      })
      .catch(e => {
        throw new Error(`should not return an error ${e.message}`);
      })
  })

  it('should allow excluding a specific file', function () {
    return execute('./verify.js -r rubygems appoptics_apm -v 4.9.0 -W -x ext/oboe_metal/src/oboe_wrap.cxx')
      .then(r => {
        throw new Error('should not return non-error');
      })
      .catch(e => {
        const {exitCode, error, stdout, stderr} = e;
        const xstderr = [
          '? important differences for 4.9.0:',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: bson',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe_debug.h',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe.h',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe.hpp',
          //'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe_wrap.cxx',
          ''
        ].join('\n');

        expect(exitCode).equal(1, 'exit code should be 1');
        expect(error.message).startsWith('Command failed: ./verify.js -r rubygems appoptics_apm -v 4.9.0 -W -x');
        expect(stdout).equal('\ndifferences\n');
        expect(stderr).equal(xstderr);
      })
  })

  it('should work with a config file', function () {
    const cmd = './verify.js -r rubygems appoptics_apm -v 4.9.0 -c test/test-config-rubygems.js';
    return execute(cmd)
      .then(r => {
        throw new Error('should not return a non-error');
      })
      .catch(e => {
        const {exitCode, error, stdout, stderr} = e;
        const xstderr = [
          '? important differences for 4.9.0:',
          'Only in pkg/pkg-unpacked/ext/oboe_metal/src: oboe_wrap.cxx',
          ''
        ].join('\n');

        expect(exitCode).equal(1, 'exit code should be 1');
        expect(error.message).startsWith(`Command failed: ${cmd}`);
        expect(stdout).equal('\ndifferences\n');
        expect(stderr).equal(xstderr);
      })
  })

  const TOKEN = process.env.GIT_TOKEN;
  const test = TOKEN ? it : it.skip;

  test('should work with pypi and private github repository', function () {
    const cmd = `./verify.js -r pypi appoptics-apm -S librato/python-appoptics -v 3.5.9 -k ${TOKEN}`;
    return execute(cmd)
      .then(r => {
        throw new Error('should not return a non-error');
      })
      .catch(e => {
        const {exitCode, error, stdout, stderr} = e;
        const xstderr = [
          '? important differences for 3.5.9:',
          'Only in pkg-unpacked/appoptics_apm/swig/bson: bson.h',
          'Only in pkg-unpacked/appoptics_apm/swig/bson: platform_hacks.h',
          'Only in pkg-unpacked/appoptics_apm/swig: liboboe-1.0-alpine-x86_64.so.0.0.0',
          'Only in pkg-unpacked/appoptics_apm/swig: liboboe-1.0-x86_64.so.0.0.0',
          'Only in pkg-unpacked/appoptics_apm/swig: oboe_debug.h',
          'Only in pkg-unpacked/appoptics_apm/swig: oboe.h',
          'Only in pkg-unpacked/appoptics_apm/swig: oboe.hpp',
          'Only in pkg-unpacked/appoptics_apm/swig: oboe.py',
          'Only in pkg-unpacked/appoptics_apm/swig: oboe_wrap.cxx',
          'Only in pkg-unpacked/appoptics_apm/swig: VERSION',
          'Only in pkg-unpacked: appoptics_apm.egg-info',
          'Only in pkg-unpacked: PKG-INFO',
          'Files pkg-unpacked/README.md and git-unpacked/README.md differ',
          'Only in pkg-unpacked: setup.cfg',
          ''
        ].join('\n');
        expect(exitCode).equal(1, 'exit code should be 1');
        expect(error.message).startsWith(`Command failed: ${cmd}`);
        expect(stdout).equal('\ndifferences\n');
        expect(stderr).equal(xstderr);
      })
  })

  test('should exclude directories and files using config file', function () {
    const cmd = `./verify.js -r pypi appoptics-apm -S librato/python-appoptics -v 3.5.9 -k ${TOKEN}`;
    const cmdWithConfig = cmd + ' -c test/test-config-pypi.js';
    return execute(cmdWithConfig)
      .then(r => {
        throw new Error('should not return a non-error');
      })
      .catch(e => {
        const {exitCode, error, stdout, stderr} = e;
        const xstderr = [
          '? important differences for 3.5.9:',
          'Files pkg-unpacked/README.md and git-unpacked/README.md differ',
          ''
        ].join('\n');
        expect(exitCode).equal(1, 'exit code should be 1');
        expect(error.message).startsWith(`Command failed: ${cmd}`);
        expect(stdout).equal('\ndifferences\n');
        expect(stderr).equal(xstderr);
      })
  })

})

//
// promise-returning exec()
//
function execute (command, options) {
  return new Promise((resolve, reject) => {
    options = Object.assign({rejectOnError: true}, options);
    let exitCode;

    const cp = exec(command, options, (error, stdout, stderr) => {
      if (error && options.rejectOnError) {
        reject({exitCode, error, stdout, stderr});
      } else {
        resolve({exitCode, error, stdout, stderr});
      }
    });
    cp.on('exit', function (code) {
      exitCode = code;
    })
  });
}
