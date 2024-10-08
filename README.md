# credential-status-manager-git

> A Typescript library for managing the status of [Verifiable Credentials](https://www.w3.org/TR/vc-data-model-2.0) in Git using [Bitstring Status List](https://www.w3.org/TR/vc-bitstring-status-list)

[![Build status](https://img.shields.io/github/actions/workflow/status/digitalcredentials/credential-status-manager-git/main.yml?branch=main)](https://github.com/digitalcredentials/credential-status-manager-git/actions?query=workflow%3A%22Node.js+CI%22)
[![NPM Version](https://img.shields.io/npm/v/@digitalcredentials/credential-status-manager-git.svg)](https://npm.im/@digitalcredentials/credential-status-manager-git)

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
- [Dependencies](#dependencies)
  - [Create credential status repositories](#create-credential-status-repositories)
  - [Generate access tokens](#generate-access-tokens)
  - [Generate DID seeds](#generate-did-seeds)
- [Contribute](#contribute)
- [License](#license)

## Background

Credentials are dynamic artifacts with a lifecycle that goes well beyond issuance. This lifecycle is liable to span revocation, suspension, and expiry, among other common states. Many proposals have been put forth to capture these statuses in Verifiable Credentials. One of the most mature specifications for this is [Bitstring Status List](https://www.w3.org/TR/vc-bitstring-status-list). This library provides an implementation of this specification that leverages Git services like GitHub and GitLab for storage and authentication.

## Install

- Node.js 20+ is recommended.

### NPM

To install via NPM:

```bash
npm install @digitalcredentials/credential-status-manager-git
```

### Development

To install locally (for development):

```bash
git clone https://github.com/digitalcredentials/credential-status-manager-git.git
cd credential-status-manager-git
npm install
```

## Usage

### Create credential status manager

The `createStatusManager` function is the only exported pure function of this library. It is an asynchronous function that accepts configuration options and returns a credential status manager that aligns with these options. Here are all the possible configuration options:

| Key | Description | Type | Required |
| --- | --- | --- | --- |
| `gitService` | name of the Git service used to manage credential status data | `github` \| `gitlab` | yes |
| `ownerAccountName` | name of the owner account (personal or organization) in the Git service used to manage credential status data | string | yes |
| `repoName` | name of the status credential repository | string | yes |
| `repoId` | ID of the status credential repository | string | yes (if `gitService` = `gitlab`) |
| `metaRepoName` | name of the credential status metadata repository | string | yes |
| `metaRepoId` | ID of the credential status metadata repository | string | yes (if `gitService` = `gitlab`) |
| `repoAccessToken` | access token for the status credential repository in the Git service API | string | yes |
| `metaRepoAccessToken` | access token for the credential status metadata repository in the Git service API | string | yes |
| `didMethod` | name of the DID method used for signing | `key` \| `web` | yes |
| `didSeed` | seed used to deterministically generate DID | string | yes |
| `didWebUrl` | URL for `did:web` | string | yes (if `didMethod` = `web`) |
| `signStatusCredential` | whether or not to sign status credentials | boolean | no (default: `true`) |
| `signUserCredential` | whether or not to sign user credentials | boolean | no (default: `false`) |

Here is a sample call to `createStatusManager`:

```ts
import { createStatusManager } from '@digitalcredentials/credential-status-manager-git';

const statusManager = await createStatusManager({
  gitService: 'github',
  ownerAccountName: 'university-xyz', // Please create an owner account (personal or organization) in your Git service of choice
  repoName: 'credential-status', // Please create a unique status credential repository in the owner account
  metaRepoName: 'credential-status-metadata', // Please create a unique credential status metadata repository in the owner account
  repoAccessToken: 'abc123', // Please create your own access token in your Git service of choice (see Dependencies section for detailed instructions)
  metaRepoAccessToken: 'def456', // Please create your own access token in your Git service of choice (see Dependencies section for detailed instructions)
  didMethod: 'key',
  didSeed: 'DsnrHBHFQP0ab59dQELh3uEwy7i5ArcOTwxkwRO2hM87CBRGWBEChPO7AjmwkAZ2' // Please create your own DID seed (see Dependencies section for detailed instructions)
});
```

**Note:** A Bitstring Status List credential can be found in the designated status credential repository (`repoName`) of the designated owner account (`ownerAccountName`) which is populated by `createStatusManager`. Additionally, relevant historical data can be found in the designated status metadata repository (`metaRepoName`) in the same owner account. Note that these repositories need to be manually created prior to calling `createStatusManager`. Finally, you can also access this Bitstring Status List credential at the relevant public URL for hosted sites in the Git service of choice (e.g., https://`ownerAccountName`.github.io/`repoName`/`statusCredentialId` for GitHub, where `statusCredentialId` is the name of a file that is automatically generated in `repoName`).

### Allocate status for credential

`allocateStatus` is an instance method that is called on a credential status manager initialized by `createStatusManager`. It is an asynchronous method that accepts a credential and an array of status purposes as input (options: `revocation` | `suspension`), records its status in a previously configured Git repo, and returns the credential with status metadata attached.

Here is a sample call to `allocateStatus`:

```ts
const credential = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: 'https://university-xyz.edu/credentials/3732',
  type: [
    'VerifiableCredential'
  ],
  issuer: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
  validFrom: '2020-03-10T04:24:12.164Z',
  credentialSubject: {
    id: 'did:example:abcdef'
  }
};
const credentialWithStatus = await statusManager.allocateStatus({
  credential,
  statusPurposes: ['revocation', 'suspension']
});
console.log(credentialWithStatus);
/*
{
  '@context': [
    'https://www.w3.org/ns/credentials/v2'
  ],
  id: 'https://university-xyz.edu/credentials/3732',
  type: [ 'VerifiableCredential' ],
  issuer: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
  validFrom: '2020-03-10T04:24:12.164Z',
  credentialSubject: { id: 'did:example:abcdef' },
  credentialStatus: [
    {
      id: 'https://credentials.example.edu/status/Uz42qSDSXTcoLH7kZ6ST#6',
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: '6',
      statusListCredential: 'https://credentials.example.edu/status/Uz42qSDSXTcoLH7kZ6ST'
    },
    {
      id: 'https://credentials.example.edu/status/9kGimd8POqM88l32F9aT#3',
      type: 'BitstringStatusListEntry',
      statusPurpose: 'suspension',
      statusListIndex: '3',
      statusListCredential: 'https://credentials.example.edu/status/9kGimd8POqM88l32F9aT'
    }
  ]
}
*/
```

**Note:** You can also call `allocateRevocationStatus(credential)` to achieve the same effect as `allocateStatus({ credential, statusPurposes: ['revocation'] })`, `allocateSuspensionStatus(credential)` to achieve the same effect as `allocateStatus({ credential, statusPurposes: ['suspension'] })`, and `allocateSupportedStatuses(credential)` to achieve the same effect as `allocateStatus({ credential, statusPurposes: ['revocation', 'suspension'] })`.

Additionally, if the caller invokes `allocateStatus` multiple times with the same credential ID against the same instance of a credential status manager, the library will not allocate a new entry. It will just return a credential with the same status info as it did in the previous invocation.

### Update status of credential

`updateStatus` is an instance method that is called on a credential status manager initialized by `createStatusManager`. It is an asynchronous method that accepts as input a credential ID, a status purpose (options: `revocation` | `suspension`), and whether to invalidate the status; records its new status in a previously configured Git repo; and returns the status credential.

Here is a sample call to `updateStatus`:

```ts
const statusCredential = await statusManager.updateStatus({
  credentialId: credentialWithStatus.id,
  statusPurpose: 'revocation',
  invalidate: true
});
console.log(statusCredential);
/*
{
  '@context': [
    'https://www.w3.org/ns/credentials/v2'
  ],
  id: 'https://university-xyz.github.io/credential-status/Uz42qSDSXTcoLH7kZ6ST',
  type: [ 'VerifiableCredential', 'BitstringStatusListCredential' ],
  credentialSubject: {
    id: 'https://university-xyz.github.io/credential-status/Uz42qSDSXTcoLH7kZ6ST#list',
    type: 'BitstringStatusList',
    encodedList: 'H4sIAAAAAAAAA-3BMQ0AAAACIGf_0LbwAhoAAAAAAAAAAAAAAIC_AfqBUGnUMAAA',
    statusPurpose: 'revocation'
  },
  issuer: 'did:key:z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC',
  validFrom: '2024-03-10T00:00:00.000Z'
}
*/
```

**Note:** You can also call `revokeCredential(credentialId)` to achieve the same effect as `updateStatus({ credentialId, statusPurpose: 'revocation', invalidate: true })` and `suspendCredential(credentialId)` to achieve the same effect as `updateStatus({ credentialId, statusPurpose: 'suspension', invalidate: true })`. Also note that `unsuspendCredential(credentialId)` will lift a suspension from a credential, while there is no equivalent reversal logic for revocation, since it is not allowed.

### Check status of credential

`getStatus` is an instance method that is called on a credential status manager initialized by `createStatusManager`. It is an asynchronous method that accepts a credential ID as input and returns status information for the credential.

Here is a sample call to `getStatus`:

```ts
const credentialStatus = await statusManager.getStatus(credentialWithStatus.id);
console.log(credentialStatus);
/*
{
  revocation: {
    statusCredentialId: 'Uz42qSDSXTcoLH7kZ6ST',
    statusListIndex: 6,
    valid: true
  },
  suspension: {
    statusCredentialId: '9kGimd8POqM88l32F9aT',
    statusListIndex: 3,
    valid: false
  }
}
*/
```

## Dependencies

### Create credential status repositories

**GitHub**
1. Login to GitHub
2. If you are using an organization as the owner account for the credential status manager and you don't already have an organization, click the plus icon in the top-right corner of the screen, click *New organization* and follow the instructions for creating a new organization \*
3. Click the plus icon in the top-right corner of the screen and click *New repository*
4. Configure a **blank public** repository for the status credential repository \*, with an optional description, that is owned by your account \*
5. Click the plus icon in the top-right corner of the screen and click *New repository*
6. Configure a **blank private** repository for the credential status metadata repository \*, with an optional description, that is owned by your account \*

**\*Note:** The names you choose for the owner account, status credential repository, and credential status metadata repository should be passed in respectively as `ownerAccountName`, `repoName`, and `metaRepoName` in invocations of `createStatusManager`. When you create these repositories, be sure **NOT** to add any files (including common default files like `.gitignore`, `README.md`, or `LICENSE`).

**GitLab**
1. Login to GitLab
2. If you are using a group as the owner account for the credential status manager and you don't already have a group, click the plus icon in the top-right corner of the screen, click *New group* and follow the instructions for creating a new group \*
3. Click the plus icon in the top-right corner of the screen and click *New project/repository*
4. Configure a **blank public** repository for the status credential repository \* that is owned by your account \*
5. Click the plus icon in the top-right corner of the screen and click *New project/repository*
6. Configure a **blank private** repository for the credential status metadata repository \* that is owned by your account \*

**\*Note:** The names you choose for the owner account, status credential repository, and credential status metadata repository, along with their IDs (which can be found at the main view for the repository/group), should be passed in respectively as `ownerAccountName`, `repoName` (ID: `repoId`), and `metaRepoName` (ID: `metaRepoId`) in invocations of `createStatusManager`. When you create these repositories, be sure **NOT** to add any files (including common default files like `.gitignore`, `README.md`, or `LICENSE`).

### Generate access tokens

**GitHub**
1. Login to GitHub as an authorized member/representative of the owner account (`ownerAccountName`)
2. Click on your profile dropdown icon in the top-right corner of the screen
3. Select the *Settings* tab
4. Select the *Developer settings* tab toward the bottom of the left navigation panel
5. Select the *Personal access tokens* tab
6. Select the *Fine-grained tokens* tab
7. Click the *Generate new token* button
8. Enter a name, expiration date, and optional description for the access token
9. Select the appropriate resource owner for the credential status repositories \*
10. Select *Only select repositories* and select the credential status repositories that you created earlier (`repoName` and/or `metaRepoName`) \*
11. Select the *Read and write* access level for the *Administration*, *Contents*, and *Pages* permissions and keep the default *Read-only* access level for the *Metadata* permission
12. Click the *Generate token* button
13. Copy the generated token
14. Use the token as the value for `repoAccessToken` and/or `metaRepoAccessToken` in invocations of `createStatusManager` and `hasAuthority` \*

**\*Note:** For the credential status metadata repository, you can either generate a separate access token and use that as the value for `metaRepoAccessToken` or include it along with `repoAccessToken` when selecting repositories. Whatever you decide, make sure to pass values for both of these values in invocations of `createStatusManager` (even though the latter option will result in the same value for these properties). If you are using an organization as the owner account for the credential status manager and `ownerAccountName` is not listed, follow [these instructions](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization) to set a personal access token policy for it.

**GitLab\***
1. Login to GitLab as an authorized member/representative of the owner account (`ownerAccountName`)
2. Select the status credential repository (`repoName`)
3. Select the *Settings* tab in the left navigation panel
4. Select the *Access Tokens* tab within the *Settings* dropdown
5. Enter a name and expiration date for the access token
6. Select the *Maintainer* role
7. Select the *api* scope
8. Click the *Create project access token* button
9. Copy the generated token
10. Use the token as the value for `repoAccessToken` in invocations of `createStatusManager` and `hasAuthority`
11. Repeat these steps for `metaRepoName` and `metaRepoAccessToken`

**\*Note:** At the time of this writing, group access tokens are only available in paid GitLab plans (i.e., Premium SaaS and Ultimate SaaS). Additionally, unlike other services, you cannot use the same access token for multiple repositories at this time (hence the need for `repoAccessToken` *and* `metaRepoAccessToken`). Finally, if you are unable to create access tokens, you are either on e free plan or you need to [enable project access token creation](https://docs.gitlab.com/ee/user/project/settings/project_access_tokens.html#enable-or-disable-project-access-token-creation).

### Generate DID seeds

In order to generate a DID seed, you will need to use software that is capable of creating it in a format that corresponds to a valid DID document. Here is sample code that does this:

```ts
import { generateSecretKeySeed } from '@digitalcredentials/bnid';

// Set `didSeed` key to this value
const secretKeySeed = await generateSecretKeySeed();
```

If `didMethod` = `web`, you must also generate a DID document and host it at `didWebUrl`/.well-known/did.json. Here is sample code that does this:

```ts
import { decodeSecretKeySeed } from '@digitalcredentials/bnid';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { X25519KeyAgreementKey2020 } from '@digitalcredentials/x25519-key-agreement-key-2020';
import * as DidWeb from '@interop/did-web-resolver';
import { CryptoLD } from '@digitalcredentials/crypto-ld';

const cryptoLd = new CryptoLD();
cryptoLd.use(Ed25519VerificationKey2020);
cryptoLd.use(X25519KeyAgreementKey2020);
const didWebDriver = DidWeb.driver({ cryptoLd });

const decodedSeed = decodeSecretKeySeed({secretKeySeed});

// Host this document at `didWebUrl`/.well-known/did.json
const didWebUrl = 'https://university-xyz.edu';
const didDocument = didWebDriver.generate({ url: didWebUrl, seed: decodedSeed });
```

## Contribute

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT License](LICENSE.md) © 2023 Digital Credentials Consortium.
