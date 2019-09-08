'use strict'

const mkdirp = require('mkdirp');
const rimraf = require('rimraf');

const repoParts = Symbol('repoParts');

class BaseVerifier {
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
    return `${this.repoDir}/${repoMeta.name}-${this.versionTag(version)}.tar.gz`;
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

module.exports = {repoParts, BaseVerifier};
