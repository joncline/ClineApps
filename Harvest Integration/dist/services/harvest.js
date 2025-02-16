import axios from 'axios';
import { AuthService } from './auth.js';
import inquirer from 'inquirer';
import fs from 'fs/promises';
export class HarvestService {
    constructor(config, isSource = true) {
        this.accountId = null;
        this.accountName = null;
        this.config = config;
        this.isSource = isSource;
        this.authService = new AuthService(config);
        this.client = axios.create({
            baseURL: 'https://api.harvestapp.com/v2',
            headers: {
                'User-Agent': 'Harvest Time Migration Tool',
            },
        });
        // Add request interceptor to handle token management
        this.client.interceptors.request.use(async (config) => {
            const tokens = await this.authService.authenticate(this.isSource);
            config.headers['Authorization'] = `Bearer ${tokens.access_token}`;
            if (this.accountId) {
                config.headers['Harvest-Account-ID'] = this.accountId;
            }
            return config;
        });
    }
    async initialize() {
        try {
            console.log(`Initializing ${this.isSource ? 'source' : 'destination'} Harvest connection...`);
            // Start fresh OAuth flow for new setup
            console.log('Starting OAuth authentication...');
            const tokens = await this.authService.performOAuthFlow(this.isSource);
            // Then get the accounts
            console.log('Fetching Harvest accounts...');
            const accountsResponse = await axios.get('https://id.getharvest.com/api/v2/accounts', {
                headers: {
                    'Authorization': `Bearer ${tokens.access_token}`,
                    'User-Agent': 'Harvest Time Migration Tool',
                }
            });
            console.log('Accounts Response:', JSON.stringify(accountsResponse.data, null, 2));
            if (!accountsResponse.data || !accountsResponse.data.accounts) {
                throw new Error('Failed to retrieve Harvest accounts');
            }
            const accounts = accountsResponse.data.accounts;
            if (accounts.length === 0) {
                throw new Error('No Harvest accounts available. Please ensure you have access to at least one account.');
            }
            console.log(`\nSelect ${this.isSource ? 'SOURCE' : 'DESTINATION'} Harvest account:`);
            accounts.forEach((account, index) => {
                console.log(`${index + 1}. ${account.name} (${account.id})`);
            });
            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'Choose an action:',
                    choices: [
                        ...accounts.map((account) => ({
                            name: `Use ${account.name} (${account.id})`,
                            value: { type: 'use', account }
                        })),
                        { name: '➕ Add New Account', value: { type: 'new' } },
                        ...accounts.map((account) => ({
                            name: `❌ Remove ${account.name} (${account.id})`,
                            value: { type: 'remove', account }
                        }))
                    ]
                }
            ]);
            if (action.type === 'new') {
                // Clear existing tokens to force new OAuth flow
                await fs.writeFile(this.config.tokenStoragePath, JSON.stringify({}, null, 2));
                console.log('Starting new account authentication...');
                // Re-run initialize to start fresh OAuth flow
                return this.initialize();
            }
            if (action.type === 'remove') {
                // Remove tokens for this account
                const tokens = await this.loadTokens();
                if (this.isSource) {
                    delete tokens.source;
                }
                else {
                    delete tokens.destination;
                }
                await fs.writeFile(this.config.tokenStoragePath, JSON.stringify(tokens, null, 2));
                console.log(`Removed account: ${action.account.name}`);
                // Re-run initialize to show updated account list
                return this.initialize();
            }
            this.accountId = action.account.id;
            this.accountName = action.account.name;
            console.log(`Selected account: ${this.accountName} (${this.accountId})`);
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to initialize Harvest service: ${error.message}`);
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
    getAccountInfo() {
        if (!this.accountId || !this.accountName) {
            return null;
        }
        return {
            id: this.accountId,
            name: this.accountName
        };
    }
    async getUsers() {
        try {
            const response = await this.client.get('/users', {
                params: {
                    is_active: true
                }
            });
            return response.data.users;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to fetch users: ${error.message}`);
            }
            throw error;
        }
    }
    async getTimeEntries(date, userId) {
        try {
            const params = {
                from: date,
                to: date,
            };
            if (userId) {
                params.user_id = userId;
            }
            const response = await this.client.get('/time_entries', { params });
            return response.data.time_entries;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to fetch time entries: ${error.message}`);
            }
            throw error;
        }
    }
    async validateProjectAndTask(projectId, taskId) {
        try {
            const projects = await this.getProjects();
            const project = projects.find(p => p.id === projectId);
            if (!project) {
                return {
                    valid: false,
                    message: `Project ID ${projectId} does not exist in the destination account`
                };
            }
            const tasks = await this.getProjectTasks(projectId);
            const task = tasks.find(t => t.task.id === taskId);
            if (!task) {
                return {
                    valid: false,
                    message: `Task ID ${taskId} does not exist in project "${project.name}"`
                };
            }
            return { valid: true };
        }
        catch (error) {
            return {
                valid: false,
                message: `Failed to validate project/task: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async createTimeEntry(entry, mapping) {
        try {
            const projectId = mapping ? mapping.projectId : entry.project.id;
            const taskId = mapping ? mapping.taskId : entry.task.id;
            // Validate project and task before creating entry
            const validation = await this.validateProjectAndTask(projectId, taskId);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.message
                };
            }
            const response = await this.client.post('/time_entries', {
                project_id: projectId,
                task_id: taskId,
                user_id: mapping?.userId,
                spent_date: entry.spent_date,
                hours: entry.hours,
                notes: entry.notes,
            });
            return { success: true };
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response?.data) {
                // Include the API error details in the message
                const details = typeof error.response.data === 'string'
                    ? error.response.data
                    : JSON.stringify(error.response.data);
                throw new Error(`Failed to create time entry: ${details}`);
            }
            throw error;
        }
    }
    async getProjects() {
        try {
            const response = await this.client.get('/projects');
            return response.data.projects;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to fetch projects: ${error.message}`);
            }
            throw error;
        }
    }
    async getProjectTasks(projectId) {
        try {
            const response = await this.client.get(`/projects/${projectId}/task_assignments`);
            return response.data.task_assignments;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to fetch project tasks: ${error.message}`);
            }
            throw error;
        }
    }
}
