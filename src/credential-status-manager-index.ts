/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import {
  BaseCredentialStatusManager,
  CredentialStatusConfigData,
  CredentialStatusManagerService,
  composeStatusCredential
} from './credential-status-manager-base.js';
import {
  GithubCredentialStatusManager,
  GithubCredentialStatusManagerOptions
} from './credential-status-manager-github.js';
import {
  GitlabCredentialStatusManager,
  GitlabCredentialStatusManagerOptions
} from './credential-status-manager-gitlab.js';
import { signCredential, getSigningMaterial } from './helpers.js';

// Type definition for base options of createStatusManager function input
interface CredentialStatusManagerBaseOptions {
  service: CredentialStatusManagerService;
}

// Type definition for createStatusManager function input
type CredentialStatusManagerOptions = CredentialStatusManagerBaseOptions &
  (GithubCredentialStatusManagerOptions | GitlabCredentialStatusManagerOptions);

// creates credential status manager
export async function createStatusManager(options: CredentialStatusManagerOptions)
: Promise<BaseCredentialStatusManager> {
  const {
    service,
    ownerAccountName,
    repoName,
    metaRepoName,
    repoAccessToken,
    metaRepoAccessToken,
    didMethod,
    didSeed,
    didWebUrl,
    signUserCredential=false,
    signStatusCredential=false
  } = options;
  let statusManager: BaseCredentialStatusManager;
  switch (service) {
    case CredentialStatusManagerService.Github:
      statusManager = new GithubCredentialStatusManager({
        ownerAccountName,
        repoName,
        metaRepoName,
        repoAccessToken,
        metaRepoAccessToken,
        didMethod,
        didSeed,
        didWebUrl,
        signUserCredential,
        signStatusCredential
      });
      break;
    case CredentialStatusManagerService.Gitlab: {
      const {
        repoId,
        metaRepoId
      } = options as GitlabCredentialStatusManagerOptions;
      statusManager = new GitlabCredentialStatusManager({
        ownerAccountName,
        repoName,
        repoId,
        metaRepoName,
        metaRepoId,
        repoAccessToken,
        metaRepoAccessToken,
        didMethod,
        didSeed,
        didWebUrl,
        signUserCredential,
        signStatusCredential
      });
      break;
    }
    default:
      throw new Error(
        '"service" must be one of the following values: ' +
        `${Object.values(CredentialStatusManagerService).map(v => `'${v}'`).join(', ')}.`
      );
  }

  // retrieve signing material
  const { issuerDid } = await getSigningMaterial({
    didMethod,
    didSeed,
    didWebUrl
  });

  // retrieve relevant data from status repo configuration
  const hasAccess = await statusManager.hasStatusAuthority(repoAccessToken, metaRepoAccessToken);
  const reposExist = await statusManager.statusReposExist();
  const reposEmpty = await statusManager.statusReposEmpty();

  if (!hasAccess) {
    throw new Error(`One or more of the access tokens you are using for the credential status repo ("${repoName}") and the credential status metadata repo ("${metaRepoName}") are incorrect or expired.`);
  }
  if (!reposExist) {
    throw new Error(`The credential status repo ("${repoName}") and the credential status metadata repo ("${metaRepoName}") must be manually created in advance.`);
  }
  if (!reposEmpty) {
    await statusManager.cleanupSnapshotData();
  } else {
    // create and persist status config
    const statusCredentialId = statusManager.generateStatusCredentialId();
    const configData: CredentialStatusConfigData = {
      latestStatusCredentialId: statusCredentialId,
      latestCredentialsIssuedCounter: 0,
      statusCredentialIds: [statusCredentialId],
      eventLog: []
    };
    await statusManager.createConfigData(configData);

    // create status credential
    const statusCredentialUrlBase = statusManager.getStatusCredentialUrlBase();
    const statusCredentialUrl = `${statusCredentialUrlBase}/${statusCredentialId}`;
    let statusCredential = await composeStatusCredential({
      issuerDid,
      credentialId: statusCredentialUrl
    });

    // sign status credential if necessary
    if (signStatusCredential) {
      statusCredential = await signCredential({
        credential: statusCredential,
        didMethod,
        didSeed,
        didWebUrl
      });
    }

    // create and persist status data
    await statusManager.createStatusData(statusCredential);

    // setup credential status website
    await statusManager.deployCredentialStatusWebsite();
  }

  return statusManager;
}
