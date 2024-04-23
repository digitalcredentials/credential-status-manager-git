/*!
 * Copyright (c) 2023-2024 Digital Credentials Consortium. All rights reserved.
 */
import {
  BaseCredentialStatusManager,
  Config,
  GitService,
  SUPPORTED_STATUS_PURPOSES,
  StatusCredentialInfo,
  composeStatusCredential
} from './credential-status-manager-base.js';
import {
  GitHubCredentialStatusManager,
  GitHubCredentialStatusManagerOptions
} from './credential-status-manager-github.js';
import {
  GitLabCredentialStatusManager,
  GitLabCredentialStatusManagerOptions
} from './credential-status-manager-gitlab.js';
import {
  BadRequestError,
  InvalidTokenError,
  MissingRepositoryError
} from './errors.js';
import { signCredential, getSigningMaterial } from './helpers.js';

// Type definition for base options of createStatusManager function input
interface CredentialStatusManagerBaseOptions {
  gitService: GitService;
}

// Type definition for createStatusManager function input
type CredentialStatusManagerOptions = CredentialStatusManagerBaseOptions &
  (GitHubCredentialStatusManagerOptions | GitLabCredentialStatusManagerOptions);

// creates credential status manager
export async function createStatusManager(options: CredentialStatusManagerOptions)
: Promise<BaseCredentialStatusManager> {
  const {
    gitService,
    ownerAccountName,
    repoName,
    metaRepoName,
    repoAccessToken,
    metaRepoAccessToken,
    didMethod,
    didSeed,
    didWebUrl,
    signStatusCredential = true,
    signUserCredential = false
  } = options;
  let statusManager: BaseCredentialStatusManager;
  switch (gitService) {
    case GitService.GitHub:
      statusManager = new GitHubCredentialStatusManager({
        ownerAccountName,
        repoName,
        metaRepoName,
        repoAccessToken,
        metaRepoAccessToken,
        didMethod,
        didSeed,
        didWebUrl,
        signStatusCredential,
        signUserCredential
      });
      break;
    case GitService.GitLab: {
      const {
        repoId,
        metaRepoId
      } = options as GitLabCredentialStatusManagerOptions;
      statusManager = new GitLabCredentialStatusManager({
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
        signStatusCredential,
        signUserCredential
      });
      break;
    }
    default:
      throw new BadRequestError({
        message:
          '"gitService" must be one of the following values: ' +
          `${Object.values(GitService).map(s => `"${s}"`).join(', ')}.`
      });
  }

  // retrieve signing material
  const { issuerDid } = await getSigningMaterial({
    didMethod,
    didSeed,
    didWebUrl
  });

  // retrieve relevant data from status repo configuration
  const hasAccess = await statusManager.hasAuthority(repoAccessToken, metaRepoAccessToken);
  if (!hasAccess) {
    throw new InvalidTokenError({ statusManager });
  }

  const reposExist = await statusManager.statusReposExist();
  if (!reposExist) {
    throw new MissingRepositoryError({ statusManager });
  }

  const reposEmpty = await statusManager.statusReposEmpty();
  if (!reposEmpty) {
    await statusManager.cleanupSnapshot();
  } else {
    // compose status credential
    const statusCredentialIds: string[] = [];
    const statusCredentialInfo = {} as StatusCredentialInfo;
    for (const statusPurpose of SUPPORTED_STATUS_PURPOSES) {
      const statusCredentialId = statusManager.generateStatusCredentialId();
      statusCredentialInfo[statusPurpose] = {
        latestStatusCredentialId: statusCredentialId,
        latestCredentialsIssuedCounter: 0,
        statusCredentialsCounter: 1
      };

      // compose status credential
      const statusCredentialUrlBase = statusManager.getStatusCredentialUrlBase();
      const statusCredentialUrl = `${statusCredentialUrlBase}/${statusCredentialId}`;
      let statusCredential = await composeStatusCredential({
        issuerDid,
        credentialId: statusCredentialUrl,
        statusPurpose
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
      await statusManager.createStatusCredential(statusCredential);
      statusCredentialIds.push(statusCredentialId);
    }

    // create and persist status config
    const config: Config = {
      credentialsIssuedCounter: 0,
      statusCredentialIds,
      statusCredentialInfo,
      eventLog: []
    };
    await statusManager.createConfig(config);

    // setup status credential website
    await statusManager.deployStatusCredentialWebsite();
  }

  return statusManager;
}
