#!/bin/bash

# This script is used to setup the environment for the e2e tests.
# It is run before the tests are executed.
# It will install the package manager for the tests.

# Get the current script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# For each package manager, cd into the directory, and run the corepack install command.
PACKAGE_MANAGERS=(npm yarn pnpm)
for package in "${PACKAGE_MANAGERS[@]}"
do
  pushd "$SCRIPT_DIR/$package"
  pushd test-project
  corepack enable
  $package install
  popd
  popd
done