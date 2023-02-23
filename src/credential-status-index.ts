import {
  BaseCredentialStatusClient,
  CredentialStatusClientType
} from './credential-status-base';
import {
  GithubCredentialStatusClient,
  GithubCredentialStatusClientOptions
} from './credential-status-github';
import {
  GitlabCredentialStatusClient,
  GitlabCredentialStatusClientOptions
} from './credential-status-gitlab';

// Type definition for createStatusListManager function input
type StatusListManagerOptions = {
  clientType: CredentialStatusClientType;
} & GithubCredentialStatusClientOptions & GitlabCredentialStatusClientOptions;

// creates credential status list manager
export function createStatusListManager(
  options: StatusListManagerOptions
): BaseCredentialStatusClient {
  const {
    clientType,
    repoName,
    metaRepoName,
    repoOrgName,
    repoOrgId,
    repoVisibility,
    accessToken
  } = options;
  let credStatusClient: BaseCredentialStatusClient;
  switch (clientType) {
    case CredentialStatusClientType.Github:
      credStatusClient = new GithubCredentialStatusClient({
        repoName,
        metaRepoName,
        repoOrgName,
        repoVisibility,
        accessToken
      });
      break;
    case CredentialStatusClientType.Gitlab:
      credStatusClient = new GitlabCredentialStatusClient({
        repoName,
        metaRepoName,
        repoOrgName,
        repoOrgId,
        repoVisibility,
        accessToken
      });
      break;
    default:
      throw new Error(
        '"clientType" must be one of the following values: ' +
        `${Object.values(CredentialStatusClientType).map(v => `'${v}'`).join(', ')}.`
      );
  }
  return credStatusClient;
}
