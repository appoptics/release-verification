#!/usr/bin/env node
'use strict'

const {makeNpmVerifier} = require('./lib/npm-verifier');
const {makeRubyVerifier} = require('./lib/ruby-verifier');
const {makePypiVerifier} = require('./lib/pypi-verifier');

const {options, showHelp} = require('./lib/get-cli-options');


if (options.help || options._.length !== 1) {
  showHelp();
  return;
}

const greenOn = process.stdout.isTTY ? '\x1b[38;5;10m' : '';
const greenOff = process.stdout.isTTY ? '\x1b[m' : '';
const redOn = process.stderr.isTTY ? '\x1b[38;5;9m' : '';
const redOff = process.stderr.isTTY ? '\x1b[m' : '';

// use pkg rather than package because it's reserved by javascript.
const pkg = options._[0];
const {versions, repository, info, differences, simulate, exclude, source} = options;

let sourceUrl = source;
if (sourceUrl) {
  sourceUrl = `https://github.com/${source}`;
}
let noWarn = false;
if (options['no-warn']) {
  noWarn = true;
}

const verifierMakers = {
  npm: makeNpmVerifier,
  rubygems: makeRubyVerifier,
  pypi: makePypiVerifier,
}

async function main () {
  const verifier = verifierMakers[repository];
  if (!verifier) {
    const valid = Object.keys(verifierMakers).join(', ');
    // eslint-disable-next-line no-console
    console.error(`${redOn}repository ${repository} not supported.${redOff} valid: ${valid}`);
    return 0;
  }
  const nv = await verifier(pkg, {info, noWarn, differences, simulate, sourceUrl});

  if (nv instanceof Error) {
    // eslint-disable-next-line no-console
    console.error(`${redOn}? can't get package ${pkg} from ${repository} - ${nv.message}`);
    return 1;
  }

  const gmvOptions = options['include-prerelease'] ? {includePrerelease: true} : {};
  const versionList = nv.getMatchingVersions(versions, gmvOptions);
  if (versionList.length === 0) {
    // eslint-disable-next-line no-console
    console.error(`${redOn}? no versions matching ${versions}${redOff}`);
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
      console.error(`${redOn}? ${result.error.toString()}${redOff}`);
      status = 1;
    } else if (result.status === 'error') {
      const diffResults = nv.extractDifferences(result, {differences, exclude});
      // there can be differences that aren't important
      if (!diffResults) {
        // eslint-disable-next-line no-console
        console.log(noDiffsMessage.replace('${version}', result.version));
      } else {

        // eslint-disable-next-line no-console
        console.error(`${redOn}? ${differences} differences for ${result.version}:\n${diffResults.join('\n')}${redOff}`);
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
