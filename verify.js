'use strict'

const fs = require('fs');
const exec = require('child_process').exec;

const mkdirp = require('mkdirp');
const axios = require('axios');
const semver = require('semver');
const rimraf = require('rimraf');

const {options, showHelp} = require('./lib/get-cli-options');

if (options.help) {
  showHelp();
  return;
}

const info = options.info ? showInfo : function () {};

const packageMap = {
  node: {
    name: 'appoptics-apm',
    releasesUrl: 'https://registry.npmjs.com/appoptics-apm',
    gitUser: 'appoptics',
    gitRepo: 'appoptics-apm-node',
    tagTemplate: 'v${tag}',
  }
}

// make places to put the downloads and a single
// place to unpack one download at a time.
mkdirp.sync('npm');
mkdirp.sync('npm-unpacked');
mkdirp.sync('git');
mkdirp.sync('git-unpacked');

let repoInfo;
let p;
let p2;
let gitRepo;
let agentMap;

if (options.agent === 'node') {
  agentMap = packageMap.node;

  p = axios.get(agentMap.releasesUrl)
    .then(info => {
      repoInfo = info.data;
      // in theory normalize this across node, ruby, python?
      return repoInfo;
    })
    .catch(e => {
      console.error(`failed to get ${agentMap.releasesUrl}:`, e);
      throw e;
    })
} else {
  // The gems go to rubygems.org.
  // https://rubygems.org/api/v1/gems/appoptics_apm.json
  // The oboe version is packaged with the gem in ext/oboe_metal/src/VERSION.
  throw new Error('only the node package is implemented');
}

let tag;

// kick off the processing here
p.then(() => {
  // repoInfo.versions['6.7.0-rc3'].dist.tarball is npm
  // version of tarball
  const versions = repoInfo.versions;

  // get versions for verification
  const versionStrings = Object.keys(versions);

  const versionsToVerify = selectVersions(versionStrings, options.versions);

  info(`versions to verify: ${[versionsToVerify.join(',')]}`);

  if (versionsToVerify.length === 0) {
    throw new TypeError('No versions to verify');
  }

  // here needs to begin sequential processing of multiple versions
  // when that gets implemented.
  return verifyThese(versionsToVerify).then(() => versionsToVerify);
}).then(results => {
  let status = 0;
  results.forEach(r => {
    if (r.status === 'error') {
      console.error('error', r);
      status = 1;
    }
  })
  return status;
}).catch(e => {
  console.error('unexpected error', e.message, e.stack);
  return 1;
}).then(status => {
  process.exit(status);
})

// execute promises sequentially with reduce. the argument "versions"
// is modified in place with the results as they are executed.
function verifyThese (versions) {
  return versions.reduce((p, version, ix) => {
    return p
      .then(r => {
        return verify(version)
          .then(r => {versions[ix] = {version, status: 'good'}});
      })
      .catch(e => {
        versions[ix] = {version, status: 'error', error: e};
      })
  }, Promise.resolve()).then(() => versions);
};

// verify the specified version
function verify (version) {
  const tag = agentMap.tagTemplate.replace('${tag}', version);
  const npmUrl = repoInfo.versions[version].dist.tarball;
  const npmTarget = `npm/npm-${tag}.tar.gz`;
  const gitUrl = `https://api.github.com/repos/${agentMap.gitUser}/${agentMap.gitRepo}/tarball/${tag}`;
  const gitTarget = `git/${agentMap.gitRepo}-${tag}.tar.gz`;

  info(`verifying version ${version}`);

  return download(npmUrl, npmTarget)
    .then(npmBytes => {
      info(`read ${npmUrl} total bytes ${npmBytes}`);
    })
    .catch(e => {
      throw e
    })
    .then(() => {
      return download(gitUrl, gitTarget)
    })
    .then(gitBytes => {
      info(`read ${gitUrl} (${gitBytes} bytes)`);
    })
    .catch(e => {
      throw e;
    })
    .then(() => {
      info('removing any unpacked npm package');

      return new Promise((resolve, reject) => {
        rimraf('npm-unpacked/*', e => {
          if (e) {
            reject(e);
          } else {
            resolve();
          }
        })
      })
    })
    .then(() => {
      info(`unpacking npm package ${npmTarget}`);
      return execute(`tar --strip-components=1 -zvxf ${npmTarget} -C npm-unpacked`);
    })
    .then(output => {
      info(`unpacked npm package ${npmTarget}`);
    })
    .catch(e => {
      throw e.error;
    })
    .then(() => {
      info('removing any unpacked git package');
      return new Promise((resolve, reject) => {
        rimraf('git-unpacked/*', e => {
          if (e) {
            reject(e);
          } else {
            resolve();
          }
        })
      })
    })
    .then(() => {
      info(`unpacking git package ${gitTarget}`);
      return execute(`tar --strip-components=1 -zvxf ${gitTarget} -C git-unpacked`);
    })
    .then(() => {
      info(`unpacked git package ${gitTarget}`);
    })
    .catch(e => {
      throw e.error;
    })
    .then(() => {
      return execute(`diff -qr npm-unpacked/ git-unpacked/`);
    })
    .catch(e => {
      // find
      // - files that are not the same in npm and git
      // - files that are only in npm
      if (e.error.code === 1) {
        const lines = e.stdout.split('\n');
        const differences = lines.filter(l => l.indexOf('Only in git-unpacked/:') !== 0);
        if (differences.length) {
          console.error(`unexpected differences for ${version}:\n${differences.join('\n')}`);
          throw new Error('packages are different');
        }
      }
      return e;
    })
    .then(output => {
      //console.log(output.stdout);
    })
}

//
// download a file at a given url to a specified name
//
function download (url, name) {
  return new Promise((resolve, reject) => {
    const axiosOptions = {
      url,
      method: 'GET',
      responseType: 'stream',
    }

    axios(axiosOptions)
      .then(r => {
        const writer = fs.createWriteStream(name)
        r.data.pipe(writer);
        writer.on('finish', () => {resolve(writer.bytesWritten)});
        writer.on('error', reject);
      })
      .catch(reject);
  })
}

//
// execute a command
//
function execute (command, options) {
  return new Promise((resolve, reject) => {
    options = options || {};

    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject({error, stdout, stderr});
      } else {
        resolve({stdout, stderr});
      }
    });
  });
}

//
// get an array of the versions that match the user's requested range
//
function selectVersions (versions, requested) {
  if (requested === 'latest') {
    return versions.slice(-1);
  }
  return versions.filter(version => semver.satisfies(version, requested));
}
// https://api.github.com/repos/$REPOSITORY_NAME/tarball/$COMMI‌​T_ID

function showInfo (string) {
  // eslint-disable-next-line no-console
  console.log(`[ ${string} ]`);
}
