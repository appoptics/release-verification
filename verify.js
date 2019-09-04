'use strict'

const fs = require('fs');
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
    gitRepo: 'appoptics/appoptics-apm-node',
    tagTemplate: 'v${tag}',
  }
}

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
      console.log(`failed to get ${releaseUrl}:`, e);
      throw e;
    })
} else {
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
})

// execute promises sequentially with reduce. the argument "versions"
// is modified in place with the results as they are executed.
function verifyThese (versions) {
  return versions.reduce((p, version, ix) => {
    return p
      .then(r => {
        return verify(version)
          .then(r => {versions[ix] = {version: r, status: 'good'}});
      })
      .catch(e => {
        versions[ix] = {version: r, status: 'error', error: e};
      })
  }, Promise.resolve()).then(() => versions);
};

// verify the specified version
function verify (version) {
  const tag = agentMap.tagTemplate.replace('${tag}', version);

  return new Promise((resolve, reject) => {
    // get the git tarball for the version
    const tarballUrl = `https://api.github.com/repos/${agentMap.gitRepo}/tarball/${tag}`;

    if (options.info) {
      console.log(`fetching tarball url ${tarballUrl}`);
    }

    const axiosOptions = {
      url: tarballUrl,
      method: 'GET',
      responseType: 'stream',
    }

    return axios(axiosOptions)
      .then(r => {
        const writer = fs.createWriteStream(`appoptics-apm-${tag}.tar.gz`)
        r.data.pipe(writer);
        writer.on('finish', () => {resolve(version)});
        writer.on('error', reject);
      })
      .catch(reject);
  })
}

//
// download a file at a given url to a specified name
//
function download (url, name) {

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
