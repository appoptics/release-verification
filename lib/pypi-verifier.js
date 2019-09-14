'use strict';


const axios = require('axios');

const {repoPartsKey, BaseVerifier} = require('./base-verifier');

// the url used to fetch metadata for a package
const packageUrlTemplate = 'https://pypi.org/pypi/${package}/json';


// must be able to fetch the package metadata or nothing else can happen.
// a constructor can't return a promise so this is a construct-initialize
// pattern.
async function makePypiVerifier (packageName, options = {}) {
  const pypiVerifier = new PypiVerifier(packageName, options);
  const versions = await pypiVerifier.initialize();
  if (versions instanceof Error) {
    return versions;
  }
  return pypiVerifier;
}


class PypiVerifier extends BaseVerifier {

  constructor (packageName, options) {
    super('pypi', packageName, options);
    this.packageMetadataUrl = packageUrlTemplate.replace('${package}', packageName);
    this.repoVersionTag = this.options.repoVersionTag || 'v${tag}';
  }

  async initialize () {
    try {
      this.packageMetadata = await this.fetchPackageMetadata();
    } catch (e) {
      return e;
    }
    const vMetadata = this.vMetadata = this.packageMetadata.releases;
    const versions = this.versions = Object.keys(vMetadata);

    this.makeRequiredDirectories();

    // decode the repo for each version so if any formats can't be handled it's known
    // at the outset.
    for (let i = 0; i < versions.length; i++) {
      // get the version-specific data
      const vsd = vMetadata[versions[i]];
      let repoParts;
      // if there is a sourceUrl option use it else verify that there is a repository of
      // the right type. try to use the home page properties but what they point to depends
      // on the publisher so they might not be right.
      let sourceUrl;
      if (this.options.sourceUrl) {
        sourceUrl = this.options.sourceUrl;
      } else if (this.packageMetadata.info.project_urls.Homepage) {
        sourceUrl = this.packageMetadata.info.project_urls.Homepage;
      } else if (this.packageMetadata.info.home_page) {
        sourceUrl = this.packageMetadata.info.home_page;
      }

      if (sourceUrl) {
        repoParts = this.extractRepoInfo(sourceUrl);
        if (!repoParts) {
          this.warn(`invalid repository ${sourceUrl} for version ${vsd.version}`);
        }
      }

      vMetadata[versions[i]][repoPartsKey] = repoParts;
    }

    return versions;
  }

  async fetchPackageMetadata (options) {
    return axios.get(this.packageMetadataUrl)
      .then(info => this.normalize(info.data))
  }

  normalize (metadata) {
    // fix up the versions so they don't point to arrays and only point to the
    // objects referencing .tar.gz files.
    const releases = {};
    const versions = Object.keys(metadata.releases);

    for (let i = 0; i < versions.length; i++) {
      // only store the version if there is entry for a .tar.gz file
      const entries = metadata.releases[versions[i]];
      for (let j = 0; j < entries.length; j++) {
        if (entries[j].url && entries[j].url.endsWith('.tar.gz')) {
          releases[versions[i]] = entries[j];
          break;
        }
      }
    }
    metadata.releases = releases;

    return metadata;
  }

  //
  // package-dependent information follows
  //
  getPkgUrl (version) {
    return this.vMetadata[version].url;
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

  // repository expected: https://github.com/<user>/<package>'
  extractRepoInfo (repository) {
    // match groups                               1         2         3
    const match = repository.match(/https:\/\/([^\/]+)\/([^\/]+)\/(.+)/);
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

module.exports = {makePypiVerifier};

if (!module.parent) {
  (async function tester () {
    const nv = await makePypiVerifier('appoptics-apm');

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
