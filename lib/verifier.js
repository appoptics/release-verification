'use strict';

const exec = require('child_process').exec;

const axios = require('axios');
const semver = require('semver');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');


const repoParts = Symbol('repoParts');

class Verifier {
  constructor (type, packageName, options) {
    // type !== 'npm' for now...
    if (type !== 'npm') {
      throw new TypeError(`type ${type} not a supported package type`);
    }
    this.options = Object.assign({}, options);
    this.type = type;
    this.package = packageName;
    this.packageMetadata = undefined;
    this.repoVersionTag = this.options.repoVersionTag || 'v${tag}';
    this.pkgDir = 'pkg';
    this.unpackedPkgDir = `${this.pkgDir}-unpacked`;
    this.repoDir = 'git';
    this.unpackedRepoDir = `${this.repoDir}-unpacked`;
  }

  async makeRequiredDirectories () {
    await pmkdirp(`${this.pkgDir}`);
    await pmkdirp(`${this.unpackedPkgDir}`);
    await pmkdirp(`${this.repoDir}`);
    await pmkdirp(`${this.unpackedRepoDir}`);
  }

  async removePreviousVersions () {
    await primraf(`${this.pkgDir}/*`);
    await primraf(`${this.unpackedPkgDir}/*`);
    await primraf(`${this.repoDir}/*`);
    await primraf(`${this.unpackedRepoDir}/*`);
  }

  pkgUrl () {
    throw new Error('pkgUrl must be implemented by the package verifier class');
  }

  pkgTarget () {
    throw new Error ('pkgTarget() must be implemented by the package verifier class');
  }

  // the repo code below probably belongs in a separate provider module (if the repo can be anything
  // besides github).
  getRepoTarballUrl (version) {
    //const gitUrl = `https://api.github.com/repos/${agentMap.gitUser}/${agentMap.gitRepo}/tarball/${tag}`;
    const repoMeta = this.vMetadata[version][repoParts];
    const tag = this.versionTag(version);
    return `https://api.github.com/repos/${repoMeta.user}/${repoMeta.name}/tarball/${tag}`;
  }

  getRepoTarget (version) {
    const repoMeta = this.vMetadata[version][repoParts];
    return `${this.unpackedRepoDir}/${repoMeta.name}-${this.versionTag(version)}.tar.gz`;
  }

  versionTag (version) {
    if (typeof this.repoVersionTag === 'function') {
      return this.repoVersionTag(version);
    }
    return this.repoVersionTag.replace('${tag}', version);
  }

}

//
// promise returning mkdirp()
//

function pmkdirp (dir, opts = {}) {
  return new Promise((resolve, reject) => {
    mkdirp(dir, opts, function (e, made) {
      if (e) {
        reject(e);
      } else {
        resolve(made);
      }
    })
  })
}

//
// promise-returning rimraf()
//
function primraf (dir) {
  return new Promise((resolve, reject) => {
    rimraf(dir, e => {
      if (e) {
        reject(e);
      } else {
        resolve();
      }
    })
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


class NpmVerifier extends Verifier {

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
      return semver.maxSatisfying(this.versions, '', options);
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
          versions[ix] = {version, status: 'error', error: e};
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
    //const npmBytes = await this.download(npmTarballUrl, pkgTarget);

    newState(`unpacking released package ${pkgTarget} to ${this.unpackedPkgDir}`);
    //const pkgRes = await execute(`tar --strip-components=1 -zvxf ${pkgTarget} -C ${this.unpackedPkgDir}`);

    const repoTarballUrl = this.getRepoTarballUrl(version);
    const repoTarget = this.getRepoTarget(version);
    newState(`downloading repo package ${repoTarballUrl} to ${repoTarget}`);
    //const repoBytes = await this.download(repoTarballUrl, repoTarget);

    newState(`unpacking repo package ${repoTarget} to ${this.unpackedRepoDir}`);
    //const repoRes = await execute(`tar --strip-components=1 -zvxf ${repoTarget} -C ${this.unpackedRepoDir}`);

    newState(`comparing ${this.unpackedPkgDir} to ${this.unpackedRepoDir}`);
    //const results = await execute(`diff -qr ${this.unpackedPkgDir} ${this.unpackedRepoDir}`);
    const results = {};

    if (results.error) {
      // a status code of one means differences. determine if the differences matter
      if (results.error.code === 1) {
        const lines = results.stdout.split('\n');
        const differences = lines.filter(l => l.indexOf(`Only in ${this.unpackedRepoDir}:`) !== 0);
        if (differences.length) {
          this.fatal(`unexpected differences for ${version}:\n${differences.join('\n')}`);
          throw new Error('packages are different');
        }
      }
    }

    return 'lines';

  }

  async fetchPackageMetadata (options) {
    return axios.get(this.npmPackageMetadataUrl)
      .then(info => this.normalize(info.data))
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

  info (...args) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }

  fatal (...args) {
    // eslint-disable-next-line no-console
    console.error(...args);
  }


}

module.exports = {makeNpmVerifier};

if (!module.parent) {
  (async function tester () {
    const nv = await makeNpmVerifier('appoptics-apm');

    const versions = nv.getMatchingVersions('>= 6.5.1 <= 6.6.0');

    return await nv.verifyThese(versions);
  })().then(r => console.log(r));
}
