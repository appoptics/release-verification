'use strict';

const fs = require('fs');
const exec = require('child_process').exec;

const axios = require('axios');
const semver = require('semver');

const {repoParts, BaseVerifier} = require('./base-verifier');

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
// promise-returning exec()
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

const npmUrlTemplate = 'https://registry.npmjs.com/${package}';


// must be able to fetch the package metadata or nothing else can happen.
// a constructor can't return a promise so this is a construct-initialize
// pattern.
async function makeNpmVerifier (packageName, options = {}) {
  const npmVerifier = new NpmVerifier(packageName, options);
  await npmVerifier.initialize();
  return npmVerifier;
}


class NpmVerifier extends BaseVerifier {

  constructor (packageName, options) {
    super('npm', packageName, options);
    this.npmPackageMetadataUrl = npmUrlTemplate.replace('${package}', packageName);
    this.repoVersionTag = this.options.repoVersionTag || 'v${tag}';
  }

  async initialize () {
    this.packageMetadata = await this.fetchPackageMetadata();
    const vMetadata = this.vMetadata = this.packageMetadata.versions;
    const versions = this.versions = Object.keys(vMetadata);

    this.makeRequiredDirectories();

    // decode the repo info for all the versions now so if there are any of an unrecognized format
    // it will throw an error at the start.
    // TODO BAM - allow skipping those that don't match
    for (let i = 0; i < versions.length; i++) {
      vMetadata[versions[i]][repoParts] = this.extractRepoInfo(vMetadata[versions[i]].repository);
    }
  }

  getMatchingVersions (selector, options) {
    if (selector === 'latest') {
      return [semver.maxSatisfying(this.versions, '', options)];
    }
    return this.versions.filter(version => semver.satisfies(version, selector, options));
  }

  // execute promises sequentially with reduce. the argument "versions"
  // is modified in place with the results as they are executed.
  async verifyThese (versions) {
    return versions.reduce((p, version, ix) => {
      return p
        .then(r => {
          return this.verify(version)
            .then(r => {versions[ix] = {version, status: 'good'}});
        })
        .catch(e => {
          const {error, stdout, stderr} = e;
          versions[ix] = {version, status: 'error', error, output: {stdout, stderr}};
        })
    }, Promise.resolve()).then(() => versions);
  }

  // verify the specified version
  // repoInfo.versions['6.6.0'].repository: {type: "git", url: "git+https://github.com/appoptics/appoptics-apm-node.git"}
  async verify (version) {
  //const tag = agentMap.tagTemplate.replace('${tag}', version);
  //const npmUrl = repoInfo.versions[version].dist.tarball;
  //const npmTarget = `npm/npm-${tag}.tar.gz`;
  //const gitUrl = `https://api.github.com/repos/${agentMap.gitUser}/${agentMap.gitRepo}/tarball/${tag}`;
  //const gitTarget = `git/${agentMap.gitRepo}-${tag}.tar.gz`;
    let state;
    const newState = string => {
      state = string;
      this.info(string);
    }

    newState(`verifying version ${version}`);

    newState('removing previous versions');
    await this.removePreviousVersions();

    const npmTarballUrl = this.vMetadata[version].dist.tarball
    const pkgTarget = this.pkgTarget(version);
    newState(`downloading npm package ${npmTarballUrl} to ${pkgTarget}`);
    const npmBytes = await download(npmTarballUrl, pkgTarget);

    newState(`unpacking released package ${pkgTarget} to ${this.unpackedPkgDir}`);
    const pkgRes = await execute(`tar --strip-components=1 -zvxf ${pkgTarget} -C ${this.unpackedPkgDir}`);

    const repoTarballUrl = this.getRepoTarballUrl(version);
    const repoTarget = this.getRepoTarget(version);
    newState(`downloading repo package ${repoTarballUrl} to ${repoTarget}`);
    const repoBytes = await download(repoTarballUrl, repoTarget);

    newState(`unpacking repo package ${repoTarget} to ${this.unpackedRepoDir}`);
    const repoRes = await execute(`tar --strip-components=1 -zvxf ${repoTarget} -C ${this.unpackedRepoDir}`);

    newState(`comparing ${this.unpackedPkgDir} to ${this.unpackedRepoDir}`);
    const results = await execute(`diff -qr ${this.unpackedPkgDir} ${this.unpackedRepoDir}`);

    return results;
  }

  async fetchPackageMetadata (options) {
    return axios.get(this.npmPackageMetadataUrl)
      .then(info => this.normalize(info.data))
  }

  extractDifferences (result, options = {}) {
    if (result.error && result.error.code === 1) {
      // a status code of one means differences. determine if the differences matter
      const lines = result.output.stdout.split('\n');

      if (options.differences) {
        if (options.differences !== 'all' && options.differences !== 'important') {
          throw new TypeError(`invalid differences option ${options.differences}`)
        }
      }

      // default to only showing important differences.
      // TODO BAM these formats might vary by diff version and/or OS implementation.
      let filter = l => l && l.indexOf(`Only in ${this.unpackedRepoDir}`) !== 0;
      if (options.differences === 'all') {
        filter = l => l && true;
      }

      const differences = lines.filter(filter);

      if (differences.length) {
        return differences;
      }
    }

    return undefined;
  }

  // in theory this can normalize across ruby and python once i discover what metadata
  // the supply.
  normalize (metadata) {
    return metadata;
  }

  //
  // select versions from those in the repository
  //
  selectVersions (selector, options = {}) {
    if (selector === 'latest') {
      return semver.maxSatisfying(this.versions, '', options);
    }

    return this.versions.filter(version => semver.satisfies(version, selector, options));
  }

  //const gitUrl = `https://api.github.com/repos/${agentMap.gitUser}/${agentMap.gitRepo}/tarball/${tag}`;
  //const gitTarget = `git/${agentMap.gitRepo}-${tag}.tar.gz`;

  //
  // package-dependent information follows
  //
  pkgUrl (version) {
    return this.versionsInfo[version].dist.tarball;
  }

  pkgTarget (version) {
    return `${this.pkgDir}/${this.type}-${this.versionTag(version)}.tar.gz`;
  }

  // i think this is npm-specific but am not sure. maybe just the type property?
  extractRepoInfo (repository) {
    if (repository.type !== 'git') {
      throw new TypeError('only a git repository can be decoded at this time');
    }
    //                                             1         2         3
    const match = repository.url.match(/git\+https:\/\/([^\/]+)\/([^\/]+)\/(.+)\.git/);

    if (!match) {
      // hmmm. there is some format we don't handle.
      throw new TypeError(`unexpected repository.url format ${repository.url}`);
    }
    return {
      host: match[1],
      user: match[2],
      name: match[3],
    }
  }

  info (string) {
    if (this.options.info) {
      // eslint-disable-next-line no-console
      console.log(`[ ${string} ]`);
    }
  }

  fatal (...args) {
    // eslint-disable-next-line no-console
    console.error('?', ...args);
  }


}

module.exports = {makeNpmVerifier};

if (!module.parent) {
  (async function tester () {
    const nv = await makeNpmVerifier('appoptics-apm');

    const versions = nv.getMatchingVersions('>= 6.5.1 <= 6.6.0');

    const results = await nv.verifyThese(versions);

    // eslint-disable-next-line no-console
    console.log('');

    results.forEach(result => {
      const differences = nv.extractDifferences(result, {differences: 'important'});
      if (differences) {
        // eslint-disable-next-line no-console
        console.log(`unexpected differences for ${result.version}:\n${differences.join('\n')}`);
      }

    })
  })().then(r =>
    // eslint-disable-next-line no-console
    console.log('done')
  );
}
