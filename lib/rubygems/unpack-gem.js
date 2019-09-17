'use strict';

const exec = require('child_process').exec;
const mkdirp = require('mkdirp');

const [node, unpacker, gemFile, gemFileDest, dataTarGzDest] = process.argv;


async function main () {
  let code = 0;
  try {
    let results; // eslint-disable-line no-unused-vars

    results = await pmkdirp(gemFileDest);
    results = await pmkdirp(dataTarGzDest);

    results = await execute(`tar -xvf ${gemFile} -C ${gemFileDest}`);

    results = await execute(`tar -zvxf ${gemFileDest}/data.tar.gz -C ${dataTarGzDest}`);
  } catch (e) {
    process.stdout.write(e.message);
    code = 1;
  }
  return code;
}


main().then(code => {
  process.exit(code);
})

//
//
//
function execute (command, options) {
  return new Promise((resolve, reject) => {
    options = Object.assign({rejectOnError: true}, options);

    let exitCode;
    const cp = exec(command, options, (error, stdout, stderr) => {
      if (error && options.rejectOnError) {
        reject({exitCode, error, stdout, stderr});
      } else {
        resolve({exitCode, error, stdout, stderr});
      }
    });
    cp.on('exit', function (code) {
      exitCode = code;
    });
  });
}

//
// promise returning mkdirp()
//
function pmkdirp (dir, opts = {}) {
  return new Promise((resolve, reject) => {
    mkdirp(dir, opts, function (e, made) {
      if (e) {
        reject(e);
      } else {
        resolve(made);
      }
    })
  })
}


