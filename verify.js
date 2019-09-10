#!/usr/bin/env node
'use strict'

const {makeNpmVerifier} = require('./lib/npm-verifier');
const {makeRubyVerifier} = require('./lib/ruby-verifier');

const {options, showHelp} = require('./lib/get-cli-options');


if (options.help || options._.length !== 1) {
  showHelp();
  return;
}

const greenOn = '\x1b[38;5;10m';
const greenOff = '\x1b[m';
const redOn = '\x1b[38;5;9m';
const redOff = '\x1b[m';

// use pkg rather than package because it's reserved by javascript.
const pkg = options._[0];
const {versions, repository, info, differences, simulate, exclude} = options;

const verifiers = {
  npm: makeNpmVerifier,
  rubygems: makeRubyVerifier,
}

async function main () {
  const verifier = verifiers[repository];
  if (!verifier) {
    const valid = Object.keys(verifiers).join(', ');
    // eslint-disable-next-line no-console
    console.error(`${redOn}repository ${repository} not supported.${redOff} valid: ${valid}`);
    return 0;
  }
  const nv = await verifier(pkg, {info, differences, simulate});

  const gmvOptions = options['include-prerelease'] ? {includePrerelease: true} : {};
  const versionList = nv.getMatchingVersions(versions, gmvOptions);
  if (versionList.length === 0) {
    // eslint-disable-next-line no-console
    console.error(`${redOn}no versions matching ${versions}${redOff}`);
    return 0;
  }

  const results = await nv.verifyThese(versionList);

  // eslint-disable-next-line no-console
  console.log('');

  const greenCheck = `${greenOn}✓${greenOff} `;
  const type = differences === 'all' ? '' : 'important ';
  const noDiffsMessage = `${greenCheck}no ${type}differences \${version}`;

  let status = 0;
  results.forEach(result => {
    if (result.status === 'fatal') {
      // eslint-disable-next-line no-console
      console.log(result.error);
    } else if (result.status === 'error') {
      const diffResults = nv.extractDifferences(result, {differences, exclude});
      // there can be differences that aren't important
      if (!diffResults) {
        // eslint-disable-next-line no-console
        console.log(noDiffsMessage.replace('${version}', result.version));
      } else {

        // eslint-disable-next-line no-console
        console.log(`${redOn}? ${differences} differences for ${result.version}:\n${diffResults.join('\n')}${redOff}`);
        status = 1;
      }
    } else if (result.status === 'good') {
      // eslint-disable-next-line no-console
      console.log(noDiffsMessage.replace('${version}', result.version));
    }
  })
  return status;
}

main().then(r => {
  const msg = r === 0 ? 'done' : 'differences';
  // eslint-disable-next-line no-console
  console.log(msg);
  process.exit(r);
})
