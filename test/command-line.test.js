'use strict';

const exec = require('child_process').exec;
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-string'));

describe('command-line tests', function () {
  this.timeout(10000);

  it('should verify the latest version', function () {
    return execute('./verify.js release-verification')
      .then(r => {
        const {exitCode, error, stdout, stderr} = r;
        expect(exitCode).equal(0, 'exit code should be 0');
        expect(error).equal(null);
        expect(stdout).equal('\n✓ no important differences 2.0.0\ndone\n');
        expect(stderr).equal('% no repository information for version 1.0.0\n');
        return error;
      });
  });

  it('should suppress warnings if requested', function () {
    return execute('./verify.js release-verification -W')
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
    return execute('./verify.js release-verification -v \'>= 1.0.0\'')
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
        expect(error.message).startsWith('Command failed: ./verify.js release-verification -v \'>= 1.0.0\'');
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
    const cwd = process.env.PWD;
    const cmd = `./verify.js -r rubygems appoptics_apm -v 4.9.0 -c ${cwd}/test/test-config.js`;
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
