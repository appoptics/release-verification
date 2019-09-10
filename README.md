
## release-verifier

release-verifier is a command line tool that verifies a released package
matches that same tagged version in a source repository.

`npm` and `rubygems` are the supported repositories and `github` is the
supported source repository.


## command line ui

to verify the latest version of the package `appoptics-apm` in the `npm` repository:

`$ node verify appoptics-apm -r npm`

to verify the latest version of the package `appoptics_apm` in the `rubygems` repository:

`$ node verify appoptics_apm -r rubygems`

to verify a specific version (note the default repository is `npm`):

`$ node verify appoptics-apm -v 6.6.0`

to verify a range of versions

`$ node verify appoptics-apm -v '> 6.0.0'`

additional options can be found in `lib/get-cli-options.js` or via `$ node verify -h`

## adding a package repository

i've tried to design the this so that repositories can be added with a minimum of
effort though the code is the only real documentation. to do so add a `PackageVerifier`
class that extends `BaseVerifier` in `lib/<package>-verifier.js`, implement the virtual
methods (and let me know what i've missed in the code and/or documentation for this).
then import your file and add the mapping of the repository name to the class in
`verify.js`.

## adding a source repository

if it's not github then some thinking will be needed. i haven't spent any time on
this.


## stuff to be done

- allow output format with detail differences
- improve tag not found errors in github
- add `--base` option to create work directories in another place
- improve error handling in general
- add config file that allows default repositories based on package name
