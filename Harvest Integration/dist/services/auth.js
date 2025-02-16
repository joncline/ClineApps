"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const express_1 = __importDefault(require("express"));
const crypto_1 = require("crypto");
const open_1 = __importDefault(require("open"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
class AuthService {
    constructor(config) {
        this.tokens = {};
        this.config = config;
    }
    async authenticate(isSource = true) {
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
    async performOAuthFlow(isSource) {
        const state = (0, crypto_1.randomBytes)(16).toString('hex');
        const authCode = await this.getAuthorizationCode(state);
        const tokens = await this.exchangeCodeForTokens(authCode);
        await this.saveTokens(tokens, isSource);
        return tokens;
    }
    async getAuthorizationCode(state) {
        return new Promise((resolve, reject) => {
            const app = (0, express_1.default)();
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
                `client_id=${this.config.clientId}&` +
                `response_type=code&` +
                `scope=${this.config.scope}&` +
                `state=${state}&` +
                `redirect_uri=${this.config.redirectUri}`;
            (0, open_1.default)(authUrl);
        });
    }
    async exchangeCodeForTokens(code) {
        const response = await axios_1.default.post('https://id.getharvest.com/api/v2/oauth2/token', {
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
    async refreshToken(tokens, isSource) {
        const response = await axios_1.default.post('https://id.getharvest.com/api/v2/oauth2/token', {
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
    async loadTokens() {
        try {
            const data = await promises_1.default.readFile(this.config.tokenStoragePath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            return {};
        }
    }
    async saveTokens(tokens, isSource) {
        const existingTokens = await this.loadTokens();
        const updatedTokens = {
            ...existingTokens,
            [isSource ? 'source' : 'destination']: tokens,
        };
        await promises_1.default.mkdir(path_1.default.dirname(this.config.tokenStoragePath), { recursive: true });
        await promises_1.default.writeFile(this.config.tokenStoragePath, JSON.stringify(updatedTokens, null, 2));
    }
    isTokenValid(tokens) {
        const expirationTime = (tokens.created_at + tokens.expires_in) * 1000;
        return Date.now() < expirationTime - 300000; // 5 minutes buffer
    }
}
exports.AuthService = AuthService;
