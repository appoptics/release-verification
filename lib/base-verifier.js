'use strict'

const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const semver = require('semver');
const axios = require('axios');
const fs = require('fs');
const exec = require('child_process').exec;

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

  getMatchingVersions (selector, options = {}) {
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
    let state;
    const newState = string => {
      state = string;
      this.info(string);
    }

    newState(`verifying version ${version}`);

    newState('removing previous versions');
    if (!this.options.simulate) {
      await this.removePreviousVersions();
    }

    const npmTarballUrl = this.vMetadata[version].dist.tarball
    const pkgTarget = this.pkgTarget(version);
    newState(`downloading npm package ${npmTarballUrl} to ${pkgTarget}`);
    if (!this.options.simulate) {
      const npmBytes = await download(npmTarballUrl, pkgTarget);
    }

    newState(`unpacking released package ${pkgTarget} to ${this.unpackedPkgDir}`);
    if (!this.options.simulate) {
      const command = this.getPackageUnpackCommand(pkgTarget, this.unpackedPkgDir);
      const pkgRes = await execute(command);
      //const pkgRes = await execute(`tar --strip-components=1 -zvxf ${pkgTarget} -C ${this.unpackedPkgDir}`);
    }

    const repoTarballUrl = this.getRepoTarballUrl(version);
    const repoTarget = this.getRepoTarget(version);
    newState(`downloading repo package ${repoTarballUrl} to ${repoTarget}`);
    if (!this.options.simulate) {
      const repoBytes = await download(repoTarballUrl, repoTarget);
    }

    newState(`unpacking repo package ${repoTarget} to ${this.unpackedRepoDir}`);
    if (!this.options.simulate) {
      const repoRes = await execute(`tar --strip-components=1 -zvxf ${repoTarget} -C ${this.unpackedRepoDir}`);
    }

    newState(`comparing ${this.unpackedPkgDir} to ${this.unpackedRepoDir}`);
    let results;
    if (!this.options.simulate) {
      results = await execute(`diff -qr ${this.unpackedPkgDir} ${this.unpackedRepoDir}`);
    } else {
      results = {stdout: '', stderr: ''};
    }

    return results;
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
