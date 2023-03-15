# status-list-manager-git

A Typescript library for managing the status of [Verifiable Credentials](https://www.w3.org/TR/vc-data-model) in Git using [Status List 2021](https://w3c-ccg.github.io/vc-status-list-2021)

[![Build status](https://img.shields.io/github/actions/workflow/status/digitalcredentials/status-list-manager-git/main.yml?branch=main)](https://github.com/digitalcredentials/status-list-manager-git/actions?query=workflow%3A%22Node.js+CI%22)
[![NPM Version](https://img.shields.io/npm/v/@digitalcredentials/status-list-manager-git.svg)](https://npm.im/@digitalcredentials/status-list-manager-git)

## Table of Contents

- [Background](#background)
- [Install](#install)
  - [NPM](#npm)
  - [Development](#development)
- [Usage](#usage)
  - [Create credential status manager](#create-credential-status-manager)
  - [Allocate status for credential](#allocate-status-for-credential)
  - [Update status of credential](#update-status-of-credential)
  - [Check status of credential](#check-status-of-credential)
  - [Check if caller has authority to update status of credentials](#check-if-caller-has-authority-to-update-status-of-credentials)
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

The `createStatusManager` function is the only exported pure function of this library. It is an asynchronous function accepts configuration options and returns a credential status manager that aligns with these options. Here are all the possible configuration options:

| Key | Description | Type | Required |
| --- | --- | --- | --- |
| `service` | name of the source control service that will host the credential status resources | `github` \| `gitlab` | yes |
| `repoName` | name of the credential status repository | string | no (default: `credential-status`) |
| `metaRepoName` | name of the credential status metadata repository | string | no (default: `credential-status-metadata`) |
| `repoOrgName` | name of the organization in the source control service that will host the credential status resources | string | yes |
| `repoOrgId` | ID of the organization in the source control service that will host the credential status resources | string | yes (if `service` = `gitlab`) |
| `repoVisibility` | level of visibility of the credential status repository | `public` \| `private` | no (default: `public`) |
| `accessToken` | access token for the source control service API | string | yes |
| `didMethod` | name of the DID method used for signing | `key` \| `web` | yes |
| `didSeed` | seed used to deterministically generate DID | string | yes |
| `didWebUrl` | URL for `did:web` | string | yes (if `didMethod` = `web`) |
| `signUserCredential` | whether or not to sign user credentials | boolean | no (default: `false`) |
| `signStatusCredential` | whether or not to sign status credentials | boolean | no (default: `false`) |

Here is a sample call to `createStatusManager`:

```ts
import { createStatusManager } from '@digitalcredentials/status-list-manager-git';

const statusManager = await createStatusManager({
  service: 'github',
  repoOrgName: 'university-xyz', // Please create your own organization on your source control service of choice
  accessToken: '@cc3$$t0k3n123',
  didMethod: 'key',
  didSeed: 'DsnrHBHFQP0ab59dQELh3uEwy7i5ArcOTwxkwRO2hM87CBRGWBEChPO7AjmwkAZ2', // Please create your own DID seed
  signStatusCredential: true
});
```

**Note:** A Status List 2021 credential can be found in the automatically generated repository, `repoName` in the organization, `repoOrgName` that was configured with `createStatusManager`. Additionally, relevant historical data can be found in the automatically generated metadata repository (`metaRepoName`) in the same organization. Finally, you can find a publicly visible version of the aforementioned Status List 2021 credential at the relevant URL for hosted sites in the source control service of choice (e.g., https://`repoOrgName`.github.io/`repoName`/`statusListId` for GitHub, where `statusListId` is the name of a file that was automatically generated in `repoName`).

### Allocate status for credential

The `allocateStatus` is an instance method that is called on a credential status manager initialized by `createStatusManager`. It is an asynchronous method that accepts a credential as input, records its status in the caller's source control service of choice, and returns the credential with status metadata attached.

Here is a sample call to `allocateStatus`:

```ts
const credential = {
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: 'http://university-xyz.edu/credentials/3732',
  type: [
    'VerifiableCredential'
  ],
  issuer: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
  issuanceDate: '2020-03-10T04:24:12.164Z',
  credentialSubject: {
    id: 'did:example:abcdef'
  }
};
const credentialWithStatus = await statusManager.allocateStatus(credential);
console.log(credentialWithStatus);
/*
{
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1',
    'https://w3id.org/vc/status-list/2021/v1'
  ],
  id: 'http://university-xyz.edu/credentials/3732',
  type: [ 'VerifiableCredential' ],
  issuer: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
  issuanceDate: '2020-03-10T04:24:12.164Z',
  credentialSubject: { id: 'did:example:abcdef' },
  credentialStatus: {
    id: 'https://university-xyz.github.io/credential-status/V27UAUYPNR#1',
    type: 'StatusList2021Entry',
    statusPurpose: 'revocation',
    statusListIndex: 1,
    statusListCredential: 'https://university-xyz.github.io/credential-status/V27UAUYPNR'
  }
}
*/
```

### Update status of credential

The `updateStatus` is an instance method that is called on a credential status manager initialized by `createStatusManager`. It is an asynchronous method that accepts a credential ID and desired credential status as input (options: `active` | `revoked`), records its new status in the caller's source control service of choice, and returns the status credential.

Here is a sample call to `updateStatus`:

```ts
const statusCredential = await statusManager.updateStatus({
  credentialId: credentialWithStatus.id,
  credentialStatus: 'revoked'
});
console.log(statusCredential);
/*
{
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://w3id.org/vc/status-list/2021/v1'
  ],
  id: 'https://university-xyz.github.io/credential-status/V27UAUYPNR',
  type: [ 'VerifiableCredential', 'StatusList2021Credential' ],
  credentialSubject: {
    id: 'https://university-xyz.github.io/credential-status/V27UAUYPNR#list',
    type: 'StatusList2021',
    encodedList: 'H4sIAAAAAAAAA-3BMQ0AAAACIGf_0LbwAhoAAAAAAAAAAAAAAIC_AfqBUGnUMAAA',
    statusPurpose: 'revocation'
  },
  issuer: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
  issuanceDate: '2023-03-15T19:21:54.093Z'
}
*/
```

### Check status of credential

The `checkStatus` is an instance method that is called on a credential status manager initialized by `createStatusManager`. It is an asynchronous method that accepts a credential ID as input and returns status information for the credential.

Here is a sample call to `checkStatus`:

```ts
const credentialStatus = await statusManager.checkStatus(credentialWithStatus.id);
console.log(credentialStatus);
/*
{
  timestamp: '2023-03-15T19:39:06.023Z',
  credentialId: 'http://university-xyz.edu/credentials/3732',
  credentialIssuer: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
  credentialSubject: 'did:example:abcdef',
  credentialState: 'revoked',
  verificationMethod: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC#z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
  statusListId: 'V27UAUYPNR',
  statusListIndex: 1
}
*/
```

### Check if caller has authority to update status of credentials

The `hasStatusAuthority` is an instance method that is called on a credential status manager initialized by `createStatusManager`. It is an asynchronous method that accepts an access token for the API of the caller's source control service of choice, and reports whether the caller has the authority to update the status of credentials.

Here is a sample call to `hasStatusAuthority` in the context of Express.js middleware:

```ts
// retrieves status list manager
export async function getCredentialStatusListManager(req, res, next) {
  try {
    req.statusManager = await getStatusListManager();
    next();
  } catch (error) {
    return res.send('Failed to retrieve credential status list manager');
  }
}

// extracts access token from request header
function extractAccessToken(headers) {
  if (!headers.authorization) {
    return;
  }
  const [scheme, token] = headers.authorization.split(' ');
  if (scheme === 'Bearer') {
    return token;
  }
}

// verifies whether caller has access to status repo
async function verifyStatusRepoAccess(req, res, next) {
  const { headers } = req;
  // verify that access token was included in request
  const accessToken = extractAccessToken(headers);
  if (!accessToken) {
    return res.send('Failed to provide access token in request');
  }
  // check if caller has access to status repo
  const hasAccess = await req.statusManager.hasStatusAuthority(accessToken);
  if (!hasAccess) {
    return res.send('Caller is unauthorized to access status repo');
  }
  next();
}
```

**Note:** This code assumes that `getStatusListManager` either calls `createStatusManager` or retrieves an existing status manager instance created at an earlier point in time.

## Contribute

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT License](LICENSE.md) © 2022 Digital Credentials Consortium.
