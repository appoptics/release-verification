'use strict';


const axios = require('axios');
const semver = require('semver');

const {repoParts, BaseVerifier} = require('./base-verifier');

const rubyUrlTemplate = 'https://rubygems.org/api/v1/versions/${package}.json'


// must be able to fetch the package metadata or nothing else can happen.
// a constructor can't return a promise so this is a construct-initialize
// pattern.
async function makeRubyVerifier (packageName, options = {}) {
  const rubyVerifier = new RubyVerifier(packageName, options);
  await rubyVerifier.initialize();
  return rubyVerifier;
}

// each array element from https://rubygems.org/api/v1/versions/${package}.json
//{
//  "authors": "Maia Engeli, Peter Giacomo Lombardo, Spiros Eliopoulos",
//  "built_at": "2019-08-28T00:00:00.000Z",
//  "created_at": "2019-08-29T00:44:33.767Z",
//  "description": "Automatic tracing and metrics for Ruby applications. Get started at appoptics.com. @AppOptics\n",
//  "downloads_count": 243,
//  "metadata": {
//    "homepage_uri": "https://www.appoptics.com/",
//    "changelog_uri": "https://github.com/appoptics/appoptics-apm-ruby/releases",
//    "source_code_uri": "https://github.com/appoptics/appoptics-apm-ruby",
//    "documentation_uri": "https://docs.appoptics.com/kb/apm_tracing/ruby/"
//  },
//  "number": "4.8.3",
//  "summary": "AppOptics APM performance instrumentation gem for Ruby",
//  "platform": "ruby",
//  "rubygems_version": "\u003e= 0",
//  "ruby_version": "\u003e= 2.0.0",
//  "prerelease": false,
//  "licenses": [
//    "Librato Open License, Version 1.0"
//  ],
//  "requirements": [],
//  "sha": "4d48e4f6ee7eb865314cbed6d47be2a77a1a4343a2a5a05192fbd877a8f5a1d7"
//},


class RubyVerifier extends BaseVerifier {

  constructor (packageName, options) {
    super('npm', packageName, options);
    this.npmPackageMetadataUrl = rubyUrlTemplate.replace('${package}', packageName);
    this.repoVersionTag = this.options.repoVersionTag || '${tag}';
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

  // create a hash by versions. this is how node was organized and it's the first
  // verifier i did, so that's the "normal" data pattern.
  normalize (metadata) {
    metadata.sort((e1, e2) => semver.compare(e1.number, e2.number));
    const vMetadata = {};

    for (let i = 0; i < metadata.length; i++) {
      vMetadata[metadata[i].number] = vMetadata[metadata[i]];
    }
    return {versions: vMetadata};
  }

  //
  // package-dependent information follows
  //
  pkgUrl (version) {
    return `https://rubygems.org/downloads/${this.package}-${version}.gem`;
  }

  pkgTarget (version) {
    return `${this.pkgDir}/${this.package}-${this.versionTag(version)}.gem`;
  }

  getPackageUnpackCommand (pkgTarget, unpackedPkgDir) {
    return `gem unpack ${pkgTarget} --target=${unpackedPkgDir}`;
  }

  // version-object.metadata.source_code_uri:
  // https://github.com/appoptics/appoptics-apm-ruby
  extractRepoInfo (versionData) {
    const repository = versionData.metadata.source_code_uri;

    //                                        1         2         3
    const match = repository.match(/https:\/\/([^\/]+)\/([^\/]+)\/(.+)/);

    if (!match) {
      // hmmm. there is some format we don't handle.
      throw new TypeError(`unexpected source_code_uri format ${repository}`);
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

module.exports = {makeRubyVerifier};

if (!module.parent) {
  (async function tester () {
    const nv = await makeRubyVerifier('appoptics-apm');

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
