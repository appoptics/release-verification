'use strict'

const {makeNpmVerifier} = require('./lib/npm-verifier');
const {makeRubyVerifier} = require('./lib/ruby-verifier');

const {options, showHelp} = require('./lib/get-cli-options');


if (options.help || options._.length !== 1) {
  showHelp();
  return;
}

// use p rather than the long name package because it's reserved by javascript.
const pkg = options._[0];
const {versions, repository, info, differences} = options;

const verifier = {
  npm: makeNpmVerifier,
  ruby: makeRubyVerifier,
}

async function main () {
  const nv = await verifier[repository](pkg, {info, differences});

  const versionList = nv.getMatchingVersions(versions);
  const results = await nv.verifyThese(versionList);

  // eslint-disable-next-line no-console
  console.log('');

  let status = 0;
  results.forEach(result => {
    const diffResults = nv.extractDifferences(result, {differences});
    if (diffResults) {
      // eslint-disable-next-line no-console
      console.log(`unexpected differences for ${result.version}:\n${diffResults.join('\n')}`);
      status = 1;
    }
  })
  return status;
}

// The gems go to rubygems.org.
// https://rubygems.org/api/v1/gems/appoptics_apm.json
// The oboe version is packaged with the gem in ext/oboe_metal/src/VERSION.


main().then(r => {
  const msg = r === 0 ? 'done' : 'differences';
  // eslint-disable-next-line no-console
  console.log(msg);
  process.exit(r);
})
