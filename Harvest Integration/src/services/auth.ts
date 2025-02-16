import express from 'express';
import { randomBytes } from 'crypto';
import open from 'open';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { OAuthConfig, OAuthTokens, StoredTokens } from '../types/auth.js';
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

  async authenticate(isSource: boolean = true): Promise<OAuthTokens> {
    const tokens = await this.loadTokens();
    const existingTokens = isSource ? tokens.source : tokens.destination;

    if (existingTokens) {
      if (this.isTokenValid(existingTokens)) {
        return existingTokens;
      }
      return this.refreshToken(existingTokens, isSource);
    }

    return this.performOAuthFlow(isSource);
  }

  private async performOAuthFlow(isSource: boolean): Promise<OAuthTokens> {
    const state = randomBytes(16).toString('hex');
    const authCode = await this.getAuthorizationCode(state);
    const tokens = await this.exchangeCodeForTokens(authCode);
    await this.saveTokens(tokens, isSource);
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
        `client_id=${this.config.clientId}&` +
        `response_type=code&` +
        `scope=${this.config.scope}&` +
        `state=${state}&` +
        `redirect_uri=${this.config.redirectUri}`;

      open(authUrl);
    });
  }

  private async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const response = await axios.post('https://id.getharvest.com/api/v2/oauth2/token', {
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
    });

    return {
      ...response.data,
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  private async refreshToken(tokens: OAuthTokens, isSource: boolean): Promise<OAuthTokens> {
    const response = await axios.post('https://id.getharvest.com/api/v2/oauth2/token', {
      refresh_token: tokens.refresh_token,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    });

    const newTokens = {
      ...response.data,
      created_at: Math.floor(Date.now() / 1000),
    };

    await this.saveTokens(newTokens, isSource);
    return newTokens;
  }

  private async loadTokens(): Promise<StoredTokens> {
    try {
      const data = await fs.readFile(this.config.tokenStoragePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  }

  private async saveTokens(tokens: OAuthTokens, isSource: boolean): Promise<void> {
    const existingTokens = await this.loadTokens();
    const updatedTokens = {
      ...existingTokens,
      [isSource ? 'source' : 'destination']: tokens,
    };

    await fs.mkdir(path.dirname(this.config.tokenStoragePath), { recursive: true });
    await fs.writeFile(
      this.config.tokenStoragePath,
      JSON.stringify(updatedTokens, null, 2)
    );
  }

  private isTokenValid(tokens: OAuthTokens): boolean {
    const expirationTime = (tokens.created_at + tokens.expires_in) * 1000;
    return Date.now() < expirationTime - 300000; // 5 minutes buffer
  }
}
