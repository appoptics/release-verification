#!/usr/bin/env node

// Copyright 2019, Solarwinds, Inc.
//
// Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted,
// provided that the above copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED
// WARRANTIES //OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
// CONSEQUENTIAL DAMAGES OR //ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
// NEGLIGENCE OR OTHER TORTIOUS //ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

'use strict'

const {makeNpmVerifier} = require('./lib/npm-verifier');
const {makeRubygemsVerifier} = require('./lib/rubygems-verifier');
const {makePypiVerifier} = require('./lib/pypi-verifier');

const getOptions = require('./lib/get-cli-options');

const {cliOptions, showHelp, error} = getOptions({configFile: {key: 'c', alias: 'config-file'}});

if (cliOptions.help || cliOptions._.length !== 1) {
  showHelp();
  return;
}

if (error) {
  // eslint-disable-next-line no-console
  console.error(`fatal error: ${error}`);
  process.exit(1);
  return;
}


const greenOn = process.stdout.isTTY ? '\x1b[38;5;10m' : '';
const greenOff = process.stdout.isTTY ? '\x1b[m' : '';
const redOn = process.stderr.isTTY ? '\x1b[38;5;9m' : '';
const redOff = process.stderr.isTTY ? '\x1b[m' : '';

// use pkg rather than package because it's reserved by javascript.
const pkg = cliOptions._[0];
const {
  versions,
  repository,
  info,
  differences,
  simulate,
  source,
  excludeFile,
  excludeDir,
  noWarn,
  tagTemplate,
  token,              // this is the github access token for an authenticated user
  otp,                // used only if actually doing authentication in the future
} = cliOptions;

// the library doesn't fill in the repository name
let sourceUrl = source;
if (sourceUrl) {
  sourceUrl = `https://github.com/${source}`;
}

// these options are passed to the constructor. others are needed for getMatchingVersions()
// and extractDifferences().
const constructorOptions = {info, noWarn, differences, simulate, sourceUrl, tagTemplate, token, otp};

const verifierMakers = {
  npm: {maker: makeNpmVerifier, tagTemplate: 'v${version}'},
  rubygems: {maker: makeRubygemsVerifier, tagTemplate: '${version}'},
  pypi: {maker: makePypiVerifier, tagTemplate: '${version}'},
}

async function main () {
  const verifier = verifierMakers[repository];
  if (!verifier) {
    const valid = Object.keys(verifierMakers).join(', ');
    // eslint-disable-next-line no-console
    console.error(`${redOn}repository ${repository} not supported.${redOff} valid: ${valid}`);
    return 0;
  }

  // supply a default tagTemplate based on the verifier if non-specified.
  if (!constructorOptions.tagTemplate) {
    constructorOptions.tagTemplate = verifier.tagTemplate;
  }

  const nv = await verifier.maker(pkg, constructorOptions);

  if (nv instanceof Error) {
    // eslint-disable-next-line no-console
    console.error(`${redOn}? can't get package ${pkg} from ${repository} - ${nv.message}`);
    return 1;
  }

  const gmvOptions = cliOptions.includePrerelease ? {includePrerelease: true} : {};
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
      const diffResults = nv.extractDifferences(result, {differences, excludeDir, excludeFile});
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
