import {
  BaseCredentialStatusClient,
  CredentialStatusClientType,
  CredentialStatusConfigData,
  CredentialStatusLogData,
  VisibilityLevel,
  composeStatusCredential
} from './credential-status-base';
import {
  GithubCredentialStatusClient,
  GithubCredentialStatusClientOptions
} from './credential-status-github';
import {
  GitlabCredentialStatusClient,
  GitlabCredentialStatusClientOptions
} from './credential-status-gitlab';
import { DidMethod, signCredential, getSigningMaterial } from './helpers';

// Type definition for createStatusListManager function input
type StatusListManagerOptions = {
  clientType: CredentialStatusClientType;
  didMethod: DidMethod;
  didSeed: string;
  didWebUrl?: string;
  signUserCredential?: boolean;
  signStatusCredential?: boolean;
} & GithubCredentialStatusClientOptions & GitlabCredentialStatusClientOptions;

// creates credential status list manager
export async function createStatusListManager({
    clientType,
    didMethod,
    didSeed,
    didWebUrl,
    signUserCredential=false,
    signStatusCredential=false,
    repoName='credential-status',
    metaRepoName='credential-status-metadata',
    repoOrgName,
    repoOrgId,
    repoVisibility=VisibilityLevel.Public,
    accessToken
  }: StatusListManagerOptions): Promise<BaseCredentialStatusClient> {
  let credStatusClient: BaseCredentialStatusClient;
  switch (clientType) {
    case CredentialStatusClientType.Github:
      credStatusClient = new GithubCredentialStatusClient({
        repoName,
        metaRepoName,
        repoOrgName,
        repoVisibility,
        accessToken,
        didMethod,
        didSeed,
        didWebUrl,
        signUserCredential,
        signStatusCredential
      });
      break;
    case CredentialStatusClientType.Gitlab:
      credStatusClient = new GitlabCredentialStatusClient({
        repoName,
        metaRepoName,
        repoOrgName,
        repoOrgId,
        repoVisibility,
        accessToken,
        didMethod,
        didSeed,
        didWebUrl,
        signUserCredential,
        signStatusCredential
      });
      break;
    default:
      throw new Error(
        '"clientType" must be one of the following values: ' +
        `${Object.values(CredentialStatusClientType).map(v => `'${v}'`).join(', ')}.`
      );
  }

  // retrieve signing material
  const { issuerDid } = await getSigningMaterial({
    didMethod,
    didSeed,
    didWebUrl
  });

  // setup status credential
  const credentialStatusUrl = credStatusClient.getCredentialStatusUrl();
  const repoExists = await credStatusClient.statusRepoExists();
  if (!repoExists) {
    // create status repo
    await credStatusClient.createStatusRepo();

    // create and persist status config
    const listId = credStatusClient.generateStatusListId();
    const configData: CredentialStatusConfigData = {
      credentialsIssued: 0,
      latestList: listId
    };
    await credStatusClient.createConfigData(configData);

    // create and persist status log
    const logData: CredentialStatusLogData = [];
    await credStatusClient.createLogData(logData);

    // create status credential
    const statusCredentialId = `${credentialStatusUrl}/${listId}`;
    let statusCredentialData = await composeStatusCredential({
      issuerDid,
      credentialId: statusCredentialId
    });

    // sign status credential if necessary
    if (signStatusCredential) {
      statusCredentialData = await signCredential({
        credential: statusCredentialData,
        didMethod,
        didSeed,
        didWebUrl
      });
    }

    // create and persist status data
    await credStatusClient.createStatusData(statusCredentialData);

    // setup credential status website
    await credStatusClient.deployCredentialStatusWebsite();
  } else {
    // sync status repo state
    await credStatusClient.syncStatusRepoState();
  }

  return credStatusClient;
}
