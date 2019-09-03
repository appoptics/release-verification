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
    releases: 'https://registry.npmjs.com/appoptics-apm',
    gitRepo: 'appoptics/appoptics-apm-node',
    tagTemplate: 'v${tag}',
  }
}

let repoInfo;
let p;
let p2;
let gitRepo;

if (options.agent === 'node') {
  const releaseUrl = packageMap.node.releases;
  gitRepo = packageMap.node.gitRepo;
  p = axios.get(releaseUrl)
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

// here p is a promise resolving to (possibly normalized) meta
// information about the package.
p
  .then(() => {
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
    p2 = verifyThese(versionsToVerify.slice(0));

    if (versionsToVerify.length !== 1) {
      console.log(`only verifying ${versionsToVerify.slice(-1)}`);
    }


    tag = packageMap.node.tagTemplate.replace('${tag}', versionsToVerify.slice(-1));
    const tarballUrl = `https://api.github.com/repos/${gitRepo}/tarball/${tag}`

    if (options.info) {
      console.log(`fetching tarball url ${tarballUrl}`);
    }

    const axiosOptions = {
      url: tarballUrl,
      method: 'GET',
      responseType: 'stream',
    }
    return axios(axiosOptions);
  })
  .then(r => {
    const writer = fs.createWriteStream(`appoptics-apm-${tag}.tar.gz`)
    r.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    })
  })
  .catch(e => {
    console.log(e.message, e.stack);
  })
  .then(r => {
    return p2;
  }).then(r => {
    console.log('finished');
  })


// reducing promises sequentially
function verifyThese (versions) {
  return versions.reduce((p, version) => {
    return p.then(() => verify(version));
  }, Promise.resolve()); // initial
};

// fake function to pretend to verify
function verify (version) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      console.log('[pretend] executed version', version);
      resolve();
    }, 250);
  });
}

function selectVersions (versions, requested) {
  if (requested === 'latest') {
    return versions.slice(-1);
  }
  return versions.filter(version => semver.satisfies(version, requested));
}
// https://api.github.com/repos/$REPOSITORY_NAME/tarball/$COMMI‌​T_ID
