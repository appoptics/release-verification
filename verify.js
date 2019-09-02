'use strict'

const axios = require('axios');
const fs = require('fs');

const options = getCommandLineOptions(process.argv);

const packageMap = {
  node: {
    releases: 'https://registry.npmjs.com/appoptics-apm',
    gitRepo: 'appoptics/appoptics-apm-node',
  }
}

let repoInfo;
let p;
let gitRepo;

if (options.package === 'node') {
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
let writer;

p
  .then(() => {
    const versions = repoInfo.versions;
    const versionStrings = Object.keys(versions);
    const lastVersion = versionStrings[versionStrings.length - 1];
    console.log(`last version ${lastVersion}`);
    console.log('keys', Object.keys(versions[lastVersion]));
    tag = `v${lastVersion}`;
    const tarballUrl = `https://api.github.com/repos/${gitRepo}/tarball/${tag}`
    console.log(`fetching tarball url ${tarballUrl}`);
    const options = {
      url: tarballUrl,
      method: 'GET',
      responseType: 'stream',
    }
    return axios(options);
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
    console.log(e.message);
  })
  .then(r => {
    console.log('finished');
  })



// https://api.github.com/repos/$REPOSITORY_NAME/tarball/$COMMI‌​T_ID

function getCommandLineOptions (argv) {
  return {package: 'node'};
}
