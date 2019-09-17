'use strict';


const axios = require('axios');

const {repoPartsKey, BaseVerifier} = require('./base-verifier');

const packageUrlTemplate = 'https://registry.npmjs.com/${package}';


// must be able to fetch the package metadata or nothing else can happen.
// a constructor can't return a promise so this is a construct-initialize
// pattern.
async function makeNpmVerifier (packageName, options = {}) {
  const npmVerifier = new NpmVerifier(packageName, options);
  const versions = await npmVerifier.initialize();
  if (versions instanceof Error) {
    return versions;
  }
  return npmVerifier;
}


class NpmVerifier extends BaseVerifier {

  constructor (packageName, options) {
    super('npm', packageName, options);
    this.packageMetadataUrl = packageUrlTemplate.replace('${package}', packageName);
    this.tagTemplate = this.options.tagTemplate || 'v${version}';
  }

  async initialize () {
    try {
      this.packageMetadata = await this.fetchPackageMetadata();
    } catch (e) {
      return e;
    }
    const vMetadata = this.vMetadata = this.packageMetadata.versions;
    const versions = this.versions = Object.keys(vMetadata);

    this.makeRequiredDirectories();

    // decode the repo info for each version so if any formats can't be handled it's known
    // at the outset.
    for (let i = 0; i < versions.length; i++) {
      // get the version-specific data
      const vsd = vMetadata[versions[i]];
      let repoParts;
      // if there is a sourceUrl option use it else verify that there is a repository of
      // the right type.
      let sourceUrl;
      if (this.options.sourceUrl) {
        sourceUrl = this.options.sourceUrl;
      } else if (!vsd.repository) {
        this.warn(`no repository information for version ${vsd.version}`);
      } else if (vsd.repository.type !== 'git') {
        this.warn(`ignoring repository type ${vsd.repository.type} for version ${vsd.version}`);
      } else {
        sourceUrl = vsd.repository.url;
      }

      if (sourceUrl) {
        repoParts = this.extractRepoInfo(sourceUrl);
        if (!repoParts) {
          this.warn(`invalid repository ${sourceUrl} for version ${vsd.version}`);
        }
      }

      vMetadata[versions[i]][repoPartsKey] = repoParts;
    }
    // versions isn't used by makeNpmVerifier but maybe in the future. need to return something
    // that isn't an error.
    return versions;
  }

  async fetchPackageMetadata (options) {
    return axios.get(this.packageMetadataUrl)
      .then(info => this.normalize(info.data))
  }

  // normalize the metadata so it's like node, at least for the versions.
  normalize (metadata) {
    return metadata;
  }

  //
  // package-dependent information follows
  //
  getPkgUrl (version) {
    return this.vMetadata[version].dist.tarball;
  }

  getPkgTarget (version) {
    return `${this.pkgDir}/${this.package}-${this.versionTag(version)}.tar.gz`;
  }

  getPkgUnpackCommand (pkgTarget) {
    return `tar --strip-components=1 -zvxf ${pkgTarget} -C ${this.unpackedPkgDir}`;
  }

  getDownloadedUnpackedPkgDir (version) {
    return this.unpackedPkgDir;
  }

  // repository: git+https://github.com/appoptics/appoptics-apm-node.git
  // this treats the 'git+' and '.git' as optional as they're not used by
  // the code.
  extractRepoInfo (repository) {
    if (repository.endsWith('.git')) {
      repository = repository.slice(0, -'.git'.length);
    }
    // match groups                 x                   1         2         3
    const match = repository.match(/(?:git\+)?https:\/\/([^\/]+)\/([^\/]+)\/(.+)/);
    if (!match) {
      // hmmm. there is some format we don't handle.
      return match;
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
