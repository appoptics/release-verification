'use strict';


const axios = require('axios');

const {repoParts, BaseVerifier} = require('./base-verifier');

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
      vMetadata[versions[i]][repoParts] = this.extractRepoInfo(vMetadata[versions[i]]);
    }
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

  //const gitUrl = `https://api.github.com/repos/${agentMap.gitUser}/${agentMap.gitRepo}/tarball/${tag}`;
  //const gitTarget = `git/${agentMap.gitRepo}-${tag}.tar.gz`;

  //
  // package-dependent information follows
  //
  getPkgUrl (version) {
    return this.vMetadata[version].dist.tarball;
  }

  getPkgTarget (version) {
    return `${this.pkgDir}/${this.package}-${this.versionTag(version)}.tar.gz`;
  }

  getPkgUnpackCommand (pkgTarget, unpackedPkgDir) {
    return `tar --strip-components=1 -zvxf ${pkgTarget} -C ${unpackedPkgDir}`;
  }

  getDownloadedUnpackedPkgDir (version) {
    return this.unpackedPkgDir;
  }

  // i think this is npm-specific but am not sure. maybe just the type property?
  // 'git+https://github.com/appoptics/appoptics-apm-node.git'
  extractRepoInfo (versionData) {
    const repository = versionData.repository;
    if (repository.type !== 'git') {
      throw new TypeError('only a git repository can be decoded at this time');
    }
    //                                                 1         2         3
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
