
## release-verifier

release-verifier is a command line tool that verifies a released package
matches that same tagged version in a source repository.

`npm`, `rubygems`, and `pypi` are the supported repositories and `github` is the
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


if a released package (or version) doesn't contain a reference to the github source
repository it can be specified with the `-S` option. the value of the `-S` option
is the user and repository name on github, e.g., `appoptics/release-verification`.

`$ node verify -r rubygems appoptics_apm -v 4.3.0 -S appoptics/appoptics-apm-ruby`


it's also possible to specify a config file. a config file essentially provides default
values for options, i.e., specifying an option on the command line overrides what is in
the config file. defaults can be either the cli option name or the alias. in the case of
aliases that contain dash characters the config file option is the camelCase version of
the kebab-case name, e.g. the `exclude-dir` command line option is mapped to the `excludeDir`
config file property. the `test` directory has two config file examples.

`$ node verify -r rubygems appoptics_apm -v 4.9.0 -c ./test/test-config-rubygems.js`


some github repositories are private. in order to work access private repositories the user
must be authenticated and supply a github token on the command line using the `--token`
option.

`$ node verify -r pypi appoptics-apm -v 3.5.9 -S librato/python-appoptics -k $GIT_TOKEN`


additional options can be found in `lib/get-cli-options.js` or via `$ node verify -h`

## adding a package repository

i've tried to design the this so that repositories can be added with a minimum of
effort. but i'm discovering the differences in various repositories as i go through them,
so the design could be better. and the code is the only real documentation. so if you have
a repository you'd like added let me know.

to add a package-repository start by creating a `<package-repository>Verifier` class that
extends `BaseVerifier`. put it in a file named `lib/<package-repository>-verifier.js`,
copy the general structure from one of the existing verifiers. then let me know what i've missed
in the code and/or documentation for this. then import your file and add the mapping of the
repository name to the class in `verify.js`.

## adding a source repository

if it's not github then some thinking will be needed. i haven't spent any time on
this. it does seem like support for bitbucket should be coming along but the source
repository is less abstracted than the package repositories.


## stuff to be done

- allow output format with detail differences
- add `--base` option to create work directories in another place
- document the api that `verify.js` uses.
- add bitbucket support.
- add download support to populate either pkg-unpacked or git-unpacked with external dependencies.
