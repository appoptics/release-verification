'use strict'

const fs = require('fs');

const mkdirp = require('mkdirp');
const axios = require('axios');
const semver = require('semver');

const {options, showHelp} = require('./lib/get-cli-options');

if (options.help) {
  showHelp();
  return;
}

const packageMap = {
  node: {
    name: 'appoptics-apm',
    releasesUrl: 'https://registry.npmjs.com/appoptics-apm',
    gitUser: 'appoptics',
    gitRepo: 'appoptics-apm-node',
    tagTemplate: 'v${tag}',
  }
}

// make places to put the downloads.
mkdirp.sync('npm');
mkdirp.sync('git');

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
      console.log(`failed to get ${agentMap.releasesUrl}:`, e);
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

  if (options.info) {
    console.log(`versions to verify: ${[versionsToVerify.join(',')]}`);
  }

  if (versionsToVerify.length === 0) {
    throw new TypeError('No versions to verify');
  }

  // here needs to begin sequential processing of multiple versions
  // when that gets implemented.
  return verifyThese(versionsToVerify).then(() => versionsToVerify);
}).then(results => {
  console.log(results);
}).catch(e => {
  console.log('unexpected error', e.message, e.stack);
})

// execute promises sequentially with reduce. the argument "versions"
// is modified in place with the results as they are executed.
function verifyThese (versions) {
  return versions.reduce((p, version, ix) => {
    return p
      .then(r => {
        return verify(version)
          .then(r => {versions[ix] = {version, status: 'good', bytes: r}});
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

  return download(npmUrl, npmTarget)
    .then(npmBytes => {
      return download(gitUrl, gitTarget)
        .then(gitBytes => {
          return {npmBytes, gitBytes};
        })
    })
    .catch(e => {
      throw e;
    })
    .then(bytes => {
      // unpack both files
      // walk through npm files (subset of git files) and compare
      // - first size, then contents
      return bytes;
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
// get an array of the versions that match the user's requested range
//
function selectVersions (versions, requested) {
  if (requested === 'latest') {
    return versions.slice(-1);
  }
  return versions.filter(version => semver.satisfies(version, requested));
}
// https://api.github.com/repos/$REPOSITORY_NAME/tarball/$COMMI‌​T_ID
