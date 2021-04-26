'use strict'

const fs = require('fs');
const exec = require('child_process').exec;
const path = require('path');

const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const semver = require('semver');
const axios = require('axios');

const repoPartsKey = Symbol('repoPartsKey');

class BaseVerifier {
  constructor (type, packageName, options) {
    this.options = Object.assign({}, options);
    this.type = type;
    // package refers to the released package (npm, rubygems, etc.)
    this.package = packageName;
    this.packageMetadata = undefined;
    this.pkgDir = 'pkg';
    this.unpackedPkgDir = `${this.pkgDir}-unpacked`;
    this.repoDir = 'git';
    this.unpackedRepoDir = `${this.repoDir}-unpacked`;
    // repo refers to git (maybe others eventually). different repos
    // use different tagging conventions, so...
    this.tagTemplate = this.options.tagTemplate || 'v${version}';
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

  // provides the URL to get in order to download the package from the repository.
  getPkgUrl () {
    throw new Error('getPkgUrl must be implemented by the package verifier class');
  }

  // provides the name for the downloaded file.
  getPkgTarget () {
    throw new Error ('getPkgTarget() must be implemented by the package verifier class');
  }

  // node is tar, ruby is gem, etc.
  getPkgUnpackCommand () {
    throw new Error ('getPkgUnpackCommand() must be implemented by the package verfier class');
  }

  // gem has no --strip-components=1 options so all package classes must implement this
  getDownloadedUnpackedPkgDir () {
    throw new Error ('getDownloadedUnpackedPkgDir() must be implemented by the package verifier class');
  }

  // the repo code below probably belongs in a separate provider module (if the repo can be anything
  // besides github).
  getRepoTarballUrl (version) {
    const repoMeta = this.vMetadata[version][repoPartsKey];
    const tag = this.versionTag(version);
    return `https://api.github.com/repos/${repoMeta.user}/${repoMeta.name}/tarball/tags/${tag}`;
  }

  getRepoTarget (version) {
    const repoMeta = this.vMetadata[version][repoPartsKey];
    return `${this.repoDir}/${repoMeta.name}-${this.versionTag(version)}.tar.gz`;
  }

  selectTagTemplate (versions) {
    if (this.options.tagTemplate) {
      return this.options.tagTemplate;
    }

    if (!versions.length) {
      return 'v${version}';
    }
    const lastVersion = versions[versions.length - 1];
    let detectedTemplate;
    if (lastVersion[0] === 'v') {
      detectedTemplate = 'v${version}';
    } else if (lastVersion[0] >= '0' && lastVersion[0] <= '9') {
      detectedTemplate = '${version}';
    }

    return detectedTemplate || defaultTemplate;
  }

  versionTag (version) {
    if (typeof this.tagTemplate === 'function') {
      return this.tagTemplate(version);
    }
    return this.tagTemplate.replace('${version}', version);
  }

  getMatchingVersions (selector, options = {}) {
    if (selector === 'latest') {
      return [semver.maxSatisfying(this.versions, '', options)];
    }
    return this.versions.filter(version => semver.satisfies(version, selector, options));
  }

  makeBaseError (code, message) {
    return {
      error: new BaseError(code, message),
      stdout: '',
      stderr: '',
    }
  }

  // execute promises sequentially with reduce. the argument "versions"
  // is modified in place with the results as they are executed.
  async verifyThese (versions) {
    return versions.reduce((p, version, ix) => {
      return p
        .then(r => {
          return this.verify(version)
            .then(r => {
              const {error, stdout, stderr} = r;
              // this combination is a simple "compare failed".
              // TODO BAM make the return code more unique?
              if (error && error.code === 1) {
                versions[ix] = {version, status: 'error', error, output: {stdout, stderr}};
              } else if (error) {
                versions[ix] = {version, status: 'fatal', error, output: {stdout, stderr}};
              } else {
                versions[ix] = {version, status: 'good'}
              }
            })
            .catch(e => {
              // it's an unexpected serious error
              const {error, stdout, stderr} = e;
              versions[ix] = {version, status: 'fatal', error, output: {stdout, stderr}};
            })
        })

    }, Promise.resolve()).then(() => versions);
  }

  //
  // verify the specified version
  //
  // core logic:
  //   fetch the package
  //   unpack it
  //   fetch the git tarball
  //   unpack it
  //   compare
  //
  async verify (version) {
    let state; // eslint-disable-line no-unused-vars
    const newState = string => {
      state = string;
      this.info(string);
    }

    // if there is not a repo associated with the package the verification fails.
    if (!this.vMetadata[version][repoPartsKey]) {
      return this.makeBaseError(
        'ENOENT',
        `no repository information for ${this.package} ${this.versionTag(version)}`
      );
    }

    newState(`verifying version ${version}`);

    newState('removing previous versions');
    if (!this.options.simulate) {
      await this.removePreviousVersions();
    }

    //
    // get the released package
    //
    const releasedPkgUrl = this.getPkgUrl(version);
    const pkgTarget = this.getPkgTarget(version);
    newState(`downloading released package ${releasedPkgUrl} to ${pkgTarget}`);
    if (!this.options.simulate) {
      try {
        await download(releasedPkgUrl, pkgTarget);
      } catch (e) {
        return this.makeBaseError(
          e.code,
          `download failed for ${releasedPkgUrl}`
        );
      }
    }

    // unpack it
    newState(`unpacking released package ${pkgTarget} to ${this.unpackedPkgDir}`);
    if (!this.options.simulate) {
      const command = this.getPkgUnpackCommand(pkgTarget);
      await execute(command);
    }

    //
    // get the git repository tarball associated with the requested versions.
    //
    const repoTarballUrl = this.getRepoTarballUrl(version);
    const repoTarget = this.getRepoTarget(version);
    newState(`downloading repo package ${repoTarballUrl} to ${repoTarget}`);

    const options = {};
    if (this.options.token || this.options.otp) {
      options.headers = {};
      if (this.options.token) {
        options.headers.Authorization = `token ${this.options.token}`;
      }
      if (this.options.otp) {
        options.headers['x-github-otp'] = `${this.options.otp}`;
      }
    }
    if (!this.options.simulate) {
      try {
        await download(repoTarballUrl, repoTarget, options);
      } catch (e) {
        return this.makeBaseError(
          e.code || e.error.message,
          `download failed for ${repoTarballUrl}`,
        );
      }
    }

    // unpack it
    newState(`unpacking repo package ${repoTarget} to ${this.unpackedRepoDir}`);
    if (!this.options.simulate) {
      await execute(`tar --strip-components=1 -zvxf ${repoTarget} -C ${this.unpackedRepoDir}`);
    }

    // diff the unpacked package and the unpacked source
    const unpackedPkgDir = this.getDownloadedUnpackedPkgDir(version);
    newState(`comparing ${unpackedPkgDir} to ${this.unpackedRepoDir}`);
    let results;
    if (!this.options.simulate) {
      results = await execute(`diff -qr ${unpackedPkgDir} ${this.unpackedRepoDir}`, {rejectOnError: false});
    } else {
      results = {stdout: '', stderr: ''};
    }

    return results;
  }

  extractDifferences (result, options = {}) {
    if (result.error && result.error.code === 1) {
      // status code 1 means differences. determine if the differences matter.
      const lines = result.output.stdout.split('\n');

      if (options.differences) {
        if (options.differences !== 'all' && options.differences !== 'important') {
          throw new TypeError(`invalid differences option ${options.differences}`)
        }
      }

      // default to only showing important differences.
      // TODO BAM these formats might vary by diff version and/or OS implementation.
      let filter = l => l && !l.startsWith(`Only in ${this.unpackedRepoDir}`);
      if (options.differences === 'all') {
        filter = l => l && true;
      }

      // now remove any excluded directories from the unpacked package only. this
      // allows ignoring files that are not in the git repository (e.g., oboe) but
      // that are in the released package.
      const base = this.getDownloadedUnpackedPkgDir(result.version);
      let excludeFilter = l => true;
      if (options.excludeDir) {
        const dirs = options.excludeDir;
        const excludes = Array.isArray(dirs) ? dirs : [dirs];
        const excludeStrings = excludes.map(exclude => {
          return `Only in ${path.join(base, exclude)}`;
        });
        excludeFilter = l => excludeStrings.some(s => !l.startsWith(s));
      }

      let differences = lines.filter(filter).filter(excludeFilter);

      // now do the same for any excluded files. this allows more granular control than
      // directories, e.g., one file in a directory is important but the others aren't.
      // TODO BAM maybe this should use glob.
      excludeFilter = l => true;
      if (options.excludeFile) {
        // eslint-disable-next-line max-len
        const excludeFiles = Array.isArray(options.excludeFile) ? options.excludeFile : [options.excludeFile];
        const excludeStrings = excludeFiles.map(exclude => {
          const last = exclude.lastIndexOf('/');
          const dir = exclude.substring(0, last);
          const file = exclude.substring(last + 1);
          return `Only in ${path.join(base, dir)}: ${file}`;
        })
        excludeFilter = l => !excludeStrings.some(s => {
          return l === s
        });
      }

      differences = differences.filter(excludeFilter);

      if (differences.length) {
        return differences;
      }
    }

    return undefined;
  }

  info (string) {
    if (this.options.info || this.options.simulate) {
      // eslint-disable-next-line no-console
      console.log(`[ ${string} ]`);
    }
  }

  warn (...args) {
    if (this.options.noWarn) {
      return;
    }
    // eslint-disable-next-line no-console
    console.warn('%', ...args);
  }

  fatal (...args) {
    // eslint-disable-next-line no-console
    console.error('?', ...args);
  }

}

//
// download a file at a given url to a specified name
//
function download (url, name, options = {}) {
  return new Promise((resolve, reject) => {
    const axiosOptions = {
      url,
      method: 'GET',
      responseType: 'stream',
    };
    if (options.headers) {
      axiosOptions.headers = options.headers;
    }

    axios(axiosOptions)
      .then(r => {
        const writer = fs.createWriteStream(name)
        r.data.pipe(writer);
        writer.on('finish', () => {resolve(writer.bytesWritten)});
        writer.on('error', reject);
      })
      .catch(e => {
        if (e.isAxiosError && e.response && e.config) {
          const cfg = e.config;
          const msg = `${cfg.method} ${cfg.url} - ${e.message}`;
          reject({error: new RangeError(msg), stdout: '', stderr: ''});
        } else {
          reject(e);
        }
      });
  })
}


class BaseError {
  constructor (code, message) {
    this.code = code;
    this.message = message;
  }

  toString () {
    return `${this.code} - ${this.message}`;
  }
}

BaseVerifier.Error = BaseError;


//
// promise-returning exec()
//
function execute (command, options) {
  return new Promise((resolve, reject) => {
    options = Object.assign({rejectOnError: true}, options);

    exec(command, options, (error, stdout, stderr) => {
      if (error && options.rejectOnError) {
        reject({error, stdout, stderr});
      } else {
        resolve({error, stdout, stderr});
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
    const options = {glob: {nosort: true, silent: true, dot: true}};
    rimraf(dir, options, e => {
      if (e) {
        reject(e);
      } else {
        resolve();
      }
    })
  })
}

module.exports = {repoPartsKey, BaseVerifier};
