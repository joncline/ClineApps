import express from 'express';
import { randomBytes } from 'crypto';
import open from 'open';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { OAuthConfig, OAuthTokens, StoredTokens, StoredAccount, AuthResult } from '../types/auth.js';
import inquirer from 'inquirer';

interface HarvestAccount {
  id: string;
  name: string;
  product: string;
}
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class AuthService {
  private config: OAuthConfig;
  private tokens: StoredTokens = {};

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  async authenticate(isSource: boolean = true): Promise<AuthResult> {
    const stored = await this.loadTokens();
    const existingAccount = isSource ? stored.source : stored.destination;

    if (existingAccount && existingAccount.id) {
      if (this.isTokenValid(existingAccount.tokens)) {
        return { tokens: existingAccount.tokens, accountId: existingAccount.id };
      }
      return this.refreshToken(existingAccount.tokens, isSource);
    }

    // No existing account, perform new OAuth flow
    const tokens = await this.performOAuthFlow(isSource);
    
    // After OAuth flow, load the newly saved account
    const updatedStored = await this.loadTokens();
    const newAccount = isSource ? updatedStored.source : updatedStored.destination;
    
    if (!newAccount || !newAccount.id) {
      throw new Error('Failed to save account information');
    }
    
    return { tokens, accountId: newAccount.id };
  }

  async performOAuthFlow(isSource: boolean): Promise<OAuthTokens> {
    const state = randomBytes(16).toString('hex');
    const authCode = await this.getAuthorizationCode(state);
    const tokens = await this.exchangeCodeForTokens(authCode);
    
    // Get account info after getting tokens
    const accountsResponse = await axios.get('https://api.harvestapp.com/api/v2/company', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'User-Agent': 'Harvest Time Migration Tool',
      }
    });

    console.log('Company response:', JSON.stringify(accountsResponse.data, null, 2));
    
    if (!accountsResponse.data) {
      throw new Error('Failed to get company information');
    }

    const company = accountsResponse.data;
    if (!company.id || !company.name) {
      throw new Error(`Invalid company data: ${JSON.stringify(company)}`);
    }
    
    const accountId = typeof company.id === 'number' ? company.id.toString() : company.id;
    
    // Save the account info
    await this.saveAccount(tokens, accountId, company.name, isSource);
    return tokens;
  }

  private async getAuthorizationCode(state: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const app = express();
      let server = app.listen(3000);

      app.get('/oauth/callback', async (req, res) => {
        const { code, state: returnedState, error } = req.query;

        if (error) {
          res.send('Authentication failed: ' + error);
          server.close();
          reject(new Error('Authentication failed: ' + error));
          return;
        }

        if (returnedState !== state) {
          res.send('Invalid state parameter');
          server.close();
          reject(new Error('Invalid state parameter'));
          return;
        }

        res.send('Authentication successful! You can close this window.');
        server.close();
        resolve(code as string);
      });

      const authUrl = `https://id.getharvest.com/oauth2/authorize?` +
        `client_id=${encodeURIComponent(this.config.clientId)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(this.config.scope)}&` +
        `state=${encodeURIComponent(state)}&` +
        `redirect_uri=${encodeURIComponent(this.config.redirectUri)}`;

      console.log('Opening browser for authentication...');
      console.log('If the browser does not open automatically, please visit:');
      console.log(authUrl);

      open(authUrl);
    });
  }

  private async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    console.log('Exchanging authorization code for tokens...');
    try {
      const data = new URLSearchParams();
      data.append('code', code);
      data.append('client_id', this.config.clientId);
      data.append('client_secret', this.config.clientSecret);
      data.append('grant_type', 'authorization_code');
      data.append('redirect_uri', this.config.redirectUri);

      const response = await axios.post('https://id.getharvest.com/api/v2/oauth2/token', 
        data.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('Token exchange response:', JSON.stringify(response.data, null, 2));
      
      if (!response.data || !response.data.access_token) {
        throw new Error('Invalid token response');
      }

      const tokens: OAuthTokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        scope: response.data.scope,
        created_at: Math.floor(Date.now() / 1000)
      };

      console.log('Token exchange successful');
      return tokens;
    } catch (error) {
      console.error('Token exchange failed');
      if (axios.isAxiosError(error)) {
        console.error('Error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            data: error.config?.data,
          }
        });
      }
      throw error;
    }
  }

  private async refreshToken(tokens: OAuthTokens, isSource: boolean): Promise<AuthResult> {
    console.log('Refreshing access token...');
    try {
      const data = new URLSearchParams();
      data.append('refresh_token', tokens.refresh_token);
      data.append('client_id', this.config.clientId);
      data.append('client_secret', this.config.clientSecret);
      data.append('grant_type', 'refresh_token');

      const response = await axios.post('https://id.getharvest.com/api/v2/oauth2/token',
        data.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('Token refresh response:', JSON.stringify(response.data, null, 2));
      
      if (!response.data || !response.data.access_token) {
        throw new Error('Invalid token refresh response');
      }

      const newTokens: OAuthTokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        scope: response.data.scope,
        created_at: Math.floor(Date.now() / 1000)
      };

      console.log('Token refresh successful');

      // Update tokens in the stored account
      const stored = await this.loadTokens();
      const account = isSource ? stored.source : stored.destination;
      
      if (!account || !account.id) {
        throw new Error('No account selected. Please initialize the service first.');
      }

      if (isSource && stored.source) {
        stored.source.tokens = newTokens;
        await this.saveStoredTokens(stored);
      } else if (!isSource && stored.destination) {
        stored.destination.tokens = newTokens;
        await this.saveStoredTokens(stored);
      }

      return { tokens: newTokens, accountId: account.id };
    } catch (error) {
      console.error('Token refresh failed');
      if (axios.isAxiosError(error)) {
        console.error('Error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            data: error.config?.data,
          }
        });
        // If refresh fails, we should clear the account and trigger a new OAuth flow
        const stored = await this.loadTokens();
        if (isSource) {
          delete stored.source;
        } else {
          delete stored.destination;
        }
        await this.saveStoredTokens(stored);
      }
      throw error;
    }
  }

  private async loadTokens(): Promise<StoredTokens> {
    try {
      const data = await fs.readFile(this.config.tokenStoragePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  }

  async saveAccount(tokens: OAuthTokens, accountId: string, accountName: string, isSource: boolean): Promise<void> {
    const stored = await this.loadTokens();
    const account: StoredAccount = {
      id: accountId,
      name: accountName,
      tokens: tokens
    };

    const updatedTokens = {
      ...stored,
      [isSource ? 'source' : 'destination']: account
    };

    await this.saveStoredTokens(updatedTokens);
  }

  private async saveStoredTokens(tokens: StoredTokens): Promise<void> {
    await fs.mkdir(path.dirname(this.config.tokenStoragePath), { recursive: true });
    await fs.writeFile(
      this.config.tokenStoragePath,
      JSON.stringify(tokens, null, 2)
    );
  }

  private isTokenValid(tokens: OAuthTokens): boolean {
    const expirationTime = (tokens.created_at + tokens.expires_in) * 1000;
    return Date.now() < expirationTime - 300000; // 5 minutes buffer
  }

  getStoredAccount(isSource: boolean): StoredAccount | undefined {
    return isSource ? this.tokens.source : this.tokens.destination;
  }
}
