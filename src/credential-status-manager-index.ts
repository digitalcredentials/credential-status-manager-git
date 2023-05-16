/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import {
  BaseCredentialStatusManager,
  CredentialStatusConfigData,
  CredentialStatusLogData,
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

// creates credential status list manager
export async function createStatusManager(options: CredentialStatusManagerOptions)
: Promise<BaseCredentialStatusManager> {
  const {
    service,
    repoName,
    metaRepoName,
    repoOrgName,
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
        repoName,
        metaRepoName,
        repoOrgName,
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
        metaRepoId,
        repoOrgId
      } = options as GitlabCredentialStatusManagerOptions;
      statusManager = new GitlabCredentialStatusManager({
        repoName,
        repoId,
        metaRepoName,
        metaRepoId,
        repoOrgName,
        repoOrgId,
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

  // setup status credential
  const credentialStatusUrl = statusManager.getCredentialStatusUrl();
  const reposExist = await statusManager.statusReposExist();
  const reposEmpty = await statusManager.statusReposEmpty();
  const statusReposProperlyConfigured = await statusManager.statusReposProperlyConfigured();

  if (!reposExist) {
    throw new Error(`The credential status repo ("${repoName}") and the credential status metadata repo ("${metaRepoName}") must be manually created in advance.`);
  }
  if (!reposEmpty) {
    if (!statusReposProperlyConfigured) {
      throw new Error(`The credential status repo ("${repoName}") and the credential status metadata repo ("${metaRepoName}") must be empty upon initialization.`);
    }
  } else {
    // create and persist status config
    const listId = statusManager.generateStatusListId();
    const configData: CredentialStatusConfigData = {
      credentialsIssued: 0,
      latestList: listId
    };
    await statusManager.createConfigData(configData);

    // create and persist status log
    const logData: CredentialStatusLogData = [];
    await statusManager.createLogData(logData);

    // create status credential
    const statusCredentialId = `${credentialStatusUrl}/${listId}`;
    let statusCredential = await composeStatusCredential({
      issuerDid,
      credentialId: statusCredentialId
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
