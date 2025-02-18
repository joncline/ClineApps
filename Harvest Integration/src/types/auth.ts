export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  tokenStoragePath: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

export interface StoredAccount {
  id: string;
  name: string;
  tokens: OAuthTokens;
}

export interface StoredTokens {
  source?: StoredAccount;
  destination?: StoredAccount;
}

export interface AuthResult {
  tokens: OAuthTokens;
  accountId: string;
}
