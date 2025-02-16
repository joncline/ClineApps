import express from 'express';
import { randomBytes } from 'crypto';
import open from 'open';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class AuthService {
    constructor(config) {
        this.tokens = {};
        this.config = config;
    }
    async authenticate(isSource = true) {
        const stored = await this.loadTokens();
        const existingAccount = isSource ? stored.source : stored.destination;
        if (existingAccount) {
            if (this.isTokenValid(existingAccount.tokens)) {
                return existingAccount.tokens;
            }
            return this.refreshToken(existingAccount.tokens, isSource);
        }
        return this.performOAuthFlow(isSource);
    }
    async performOAuthFlow(isSource) {
        const state = randomBytes(16).toString('hex');
        const authCode = await this.getAuthorizationCode(state);
        const tokens = await this.exchangeCodeForTokens(authCode);
        return tokens;
    }
    async getAuthorizationCode(state) {
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
                resolve(code);
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
    async exchangeCodeForTokens(code) {
        console.log('Exchanging authorization code for tokens...');
        try {
            const data = new URLSearchParams();
            data.append('code', code);
            data.append('client_id', this.config.clientId);
            data.append('client_secret', this.config.clientSecret);
            data.append('grant_type', 'authorization_code');
            data.append('redirect_uri', this.config.redirectUri);
            const response = await axios.post('https://id.getharvest.com/api/v2/oauth2/token', data.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            console.log('Token exchange successful');
            return {
                ...response.data,
                created_at: Math.floor(Date.now() / 1000),
            };
        }
        catch (error) {
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
    async refreshToken(tokens, isSource) {
        console.log('Refreshing access token...');
        try {
            const data = new URLSearchParams();
            data.append('refresh_token', tokens.refresh_token);
            data.append('client_id', this.config.clientId);
            data.append('client_secret', this.config.clientSecret);
            data.append('grant_type', 'refresh_token');
            const response = await axios.post('https://id.getharvest.com/api/v2/oauth2/token', data.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            console.log('Token refresh successful');
            const newTokens = {
                ...response.data,
                created_at: Math.floor(Date.now() / 1000),
            };
            // Update tokens in the stored account
            const stored = await this.loadTokens();
            if (isSource && stored.source) {
                stored.source.tokens = newTokens;
                await this.saveStoredTokens(stored);
            }
            else if (!isSource && stored.destination) {
                stored.destination.tokens = newTokens;
                await this.saveStoredTokens(stored);
            }
            return newTokens;
        }
        catch (error) {
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
                }
                else {
                    delete stored.destination;
                }
                await this.saveStoredTokens(stored);
            }
            throw error;
        }
    }
    async loadTokens() {
        try {
            const data = await fs.readFile(this.config.tokenStoragePath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            return {};
        }
    }
    async saveAccount(tokens, accountId, accountName, isSource) {
        const stored = await this.loadTokens();
        const account = {
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
    async saveStoredTokens(tokens) {
        await fs.mkdir(path.dirname(this.config.tokenStoragePath), { recursive: true });
        await fs.writeFile(this.config.tokenStoragePath, JSON.stringify(tokens, null, 2));
    }
    isTokenValid(tokens) {
        const expirationTime = (tokens.created_at + tokens.expires_in) * 1000;
        return Date.now() < expirationTime - 300000; // 5 minutes buffer
    }
    getStoredAccount(isSource) {
        return isSource ? this.tokens.source : this.tokens.destination;
    }
}
