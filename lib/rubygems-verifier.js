'use strict';


const axios = require('axios');
const semver = require('semver');

const {repoPartsKey, BaseVerifier} = require('./base-verifier');

const packageUrlTemplate = 'https://rubygems.org/api/v1/versions/${package}.json'


// must be able to fetch the package metadata or nothing else can happen.
// a constructor can't return a promise so this is a construct-initialize
// pattern.
async function makeRubygemsVerifier (packageName, options = {}) {
  const rubygemsVerifier = new RubygemsVerifier(packageName, options);
  const versions = await rubygemsVerifier.initialize();
  if (versions instanceof Error) {
    return versions;
  }
  return rubygemsVerifier;
}

class RubygemsVerifier extends BaseVerifier {

  constructor (packageName, options) {
    super('rubygems', packageName, options);
    this.packageMetadataUrl = packageUrlTemplate.replace('${package}', packageName);
  }

  async initialize () {
    try {
      this.packageMetadata = await this.fetchPackageMetadata();
    } catch (e) {
      return e;
    }
    const vMetadata = this.vMetadata = this.packageMetadata.versions;
    const versions = this.versions = Object.keys(vMetadata);
    this.tagTemplate = this.selectTagTemplate(versions);

    this.makeRequiredDirectories();

    // decode the repo info for each version so if any formats can't be handled it's known
    // at the outset.
    for (let i = 0; i < versions.length; i++) {
      const vsd = vMetadata[versions[i]];
      let repoParts;
      // if there is a sourceUrl option use it else verify that there is a repository of
      // the right type.
      let sourceUrl;
      if (this.options.sourceUrl) {
        sourceUrl = this.options.sourceUrl;
      } else if (!vsd.metadata || !vsd.metadata.source_code_uri) {
        this.warn(`no repository information for version ${vsd.number}`);
      } else {
        sourceUrl = vsd.metadata.source_code_uri;
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

  // create a hash by versions. this is how node was organized and it's the first
  // verifier i did, so that's the "normal" data pattern.
  normalize (metadata) {
    metadata.sort((e1, e2) => semver.compare(e1.number, e2.number));
    const vMetadata = {};

    for (let i = 0; i < metadata.length; i++) {
      vMetadata[metadata[i].number] = metadata[i];
    }
    return {versions: vMetadata};
  }

  //
  // package-dependent information follows
  //
  getPkgUrl (version) {
    return `https://rubygems.org/downloads/${this.package}-${version}.gem`;
  }

  getPkgTarget (version) {
    return `${this.pkgDir}/${this.package}-${this.versionTag(version)}.gem`;
  }

  getPkgUnpackCommand (pkgTarget) {
    return `node lib/rubygems/unpack-gem ${pkgTarget} ${this.pkgDir}/unpacked-gem ${this.pkgDir}/${this.unpackedPkgDir}`;
  }

  getDownloadedUnpackedPkgDir (version) {
    return `${this.pkgDir}/${this.unpackedPkgDir}`;
  }

  // version-object.metadata.source_code_uri: https://github.com/appoptics/appoptics-apm-ruby
  extractRepoInfo (repository) {
    // match groups                     x          1         2         3
    const match = repository.match(/http(?:s)?:\/\/([^\/]+)\/([^\/]+)\/(.+)/);
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

module.exports = {makeRubygemsVerifier};

if (!module.parent) {
  (async function tester () {
    const nv = await makeRubygemsVerifier('appoptics_apm');

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
