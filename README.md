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

Credentials are dynamic artifacts with a robust lifecycle that goes well beyond issuance. This lifecycle is liable to span revocation, suspension, and expiry, among other common states. Many proposals have been put forth to capture this model in Verifiable Credentials. One of the most mature specifications for this is [Status List 2021](https://w3c-ccg.github.io/vc-status-list-2021). This library provides an implementation of this specification that leverages Git source control services like GitHub and GitLab for storage and authentication.

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

### Create credential status manager

The `createStatusListManager` function is the only exported pure function of this library. It accepts configuration options and outputs an instance of a credential status manager that complies with these options. Here are all the possible configuration options:

| Key | Description | Type | Required |
| --- | --- | --- | --- |
| `clientType` | name of the source control service that will host the credential status resources | `github` \| `gitlab` | yes |
| `repoName` | name of the credential status repository | string | no (default: `credential-status`) |
| `metaRepoName` | name of the credential status metadata repository | string | no (default: `credential-status-metadata`) |
| `repoOrgName` | name of the organization in the source control service that will host the credential status resources | string | yes |
| `repoOrgId` | ID of the organization in the source control service that will host the credential status resources | string | yes (if `clientType` = `gitlab`) |
| `repoVisibility` | level of visibility of the credential status repository | `public` \| `private` | no (default: `public`) |
| `accessToken` | access token for the source control service API | string | yes |
| `didMethod` | name of the DID method used for signing | `key` \| `web` | yes |
| `didSeed` | seed used to deterministically generate DID | string | yes |
| `didWebUrl` | URL for `did:web` | string | yes (if `didMethod` = `web`) |
| `signUserCredential` | whether or not to sign user credential | boolean | no (default: `false`) |
| `signStatusCredential` | whether or not to sign status credential | boolean | no (default: `false`) |

## Contribute

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT License](LICENSE.md) © 2022 Digital Credentials Consortium.
