# status-list-manager-git

A Typescript library for managing the status of [Verifiable Credentials](https://www.w3.org/TR/vc-data-model) in Git using [Status List 2021](https://w3c-ccg.github.io/vc-status-list-2021)

[![Build status](https://img.shields.io/github/actions/workflow/status/digitalcredentials/status-list-manager-git/main.yml?branch=main)](https://github.com/digitalcredentials/status-list-manager-git/actions?query=workflow%3A%22Node.js+CI%22)
[![NPM Version](https://img.shields.io/npm/v/@digitalcredentials/status-list-manager-git.svg)](https://npm.im/@digitalcredentials/status-list-manager-git)

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Contribute](#contribute)
- [License](#license)

## Background

Credentials are dynamic artifacts with a robust lifecycle that goes well beyond issuance. This lifecycle is liable to span revocation, suspension, and expiry, among other common states. Many proposals have been put forth to capture this model in Verifiable Credentials. One of the most mature specifications for this is [Status List 2021](https://w3c-ccg.github.io/vc-status-list-2021). This library provides an implementation of this specification that leverages version control systems like GitHub and GitLab for storage and authentication.

## Install

- Node.js 16+ is recommended.

### NPM

To install via NPM:

```
npm install @digitalcredentials/status-list-manager-git
```

### Development

To install locally (for development):

```
git clone https://github.com/digitalcredentials/status-list-manager-git.git
cd status-list-manager-git
npm install
```

## Usage

### Create status list manager

The `createStatusListManager` function is the only exported pure function of this library. It accepts configuration options and outputs an instance of a status list manager that complies with these options. Here are all the possible configuration options:

- `clientType`: credential status management service - options: `github` | `gitlab` (required)
- `repoName`: name of the credential status repository (optional, default: `credential-status`)
- `metaRepoName`: name of the credential status metadata repository (optional, default: `credential-status-metadata`)
- `repoOrgName`: name of the organization in the source control service that will host the credential status repository (required)
- `repoOrgId`: ID of the organization in the source control service that will host the credential status repository (required if `clientType` = `gitlab`)
- `repoVisibility`: level of visibility of the credential status repository - options: `public` | `private` (optional, default: `public`)
- `accessToken`: access token for the source control service API (required)
- `didMethod`: DID method used for signing - options: `key` | `web` (required)
- `didSeed`: seed used to deterministically generate DID (required)
- `didWebUrl`: URL for `did:web` (required if `didMethod` = `web`)
- `signUserCredential`: whether or not to sign user credential - options: `true` | `false` (optional, default: `false`)
- `signStatusCredential`: whether or not to sign status credential - options: `true` | `false` (optional, default: `false`)

## Contribute

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT License](LICENSE.md) © 2022 Digital Credentials Consortium.
