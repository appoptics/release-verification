'use strict';

const axios = require('axios');
const semver = require('semver');

class Verifier {
  constructor (type, packageName) {
    // type !== 'npm' for now...
    if (type !== 'npm') {
      throw new TypeError(`type ${type} not a supported package type`);
    }
    this.type = type;
    this.package = packageName;
    this.packageMetadata = undefined;
  }
}

const npmUrlTemplate = 'https://registry.npmjs.com/${package}';

class NpmVerifier extends Verifier {
  constructor (packageName, options) {
    super('npm', packageName);
    this.options = Object.assign({}, options);
    this.npmPackageMetadataUrl = npmUrlTemplate.replace('${package}', packageName);
    this.gitVersionTag = this.options.gitVersionTag || 'v${tag}';
  }

  async getVersionsToVerify (options = {}) {
    if (!this.packageMetadata) {
      await this.fetchPackageMetadata();
    }

    const versionsInfo = this.packageMetadata.versions;
    const versions = Object.keys(versionsInfo);
    const selector = options.versions || this.options.versions || 'latest';
    return this.versionsToVerify = this.selectVersions(versions, selector);
  }

  async verifyThese (versionsToVerify) {
    return 'nyi';
  }

  async fetchPackageMetadata (options) {
    return axios.get(this.npmPackageMetadataUrl)
      .then(info => this.packageMetadata = this.normalize(info.data))
  }

  selectVersions (versions, selector) {
    if (selector === 'latest') {
      return versions.slice(-1);
    }
    return versions.filter(version => semver.satisfies(version, selector));
  }

  // in theory this can normalize across ruby and python once i discover what metadata
  // the supply.
  normalize (metadata) {
    return metadata;
  }


}

module.exports = {Verifier, NpmVerifier};
