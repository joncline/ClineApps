import axios from 'axios';
import { AuthService } from './auth.js';
import fs from 'fs/promises';
import path from 'path';
export class HarvestService {
    constructor(config, isSource = true) {
        this.accountId = null;
        this.accountName = null;
        this.config = config;
        this.isSource = isSource;
        this.authService = new AuthService(config);
        this.client = axios.create({
            baseURL: 'https://api.harvestapp.com/api/v2',
            headers: {
                'User-Agent': 'Harvest Time Migration Tool',
            },
        });
        // Add request interceptor to handle token management
        this.client.interceptors.request.use(async (config) => {
            const auth = await this.authService.authenticate(this.isSource);
            // Update instance account ID if needed
            if (auth.accountId !== this.accountId) {
                this.accountId = auth.accountId;
            }
            // Set headers
            const headers = {
                'Authorization': `Bearer ${auth.tokens.access_token}`,
                'Harvest-Account-ID': auth.accountId,
                'User-Agent': 'Harvest Time Migration Tool'
            };
            // Use type assertion to handle the headers
            config.headers = { ...config.headers, ...headers };
            // Log request details
            console.log('\nPreparing request to Harvest API:');
            console.log('URL:', config.url);
            console.log('Headers:', headers);
            return config;
        });
    }
    async initialize() {
        try {
            console.log(`Initializing ${this.isSource ? 'source' : 'destination'} Harvest connection...`);
            // Start fresh OAuth flow for new setup
            console.log('Starting OAuth authentication...');
            const auth = await this.authService.authenticate(this.isSource);
            // Update instance state with the selected account
            this.accountId = auth.accountId;
            const tokens = await this.loadTokens();
            const account = this.isSource ? tokens.source : tokens.destination;
            if (account) {
                this.accountName = account.name;
                console.log(`Selected account: ${this.accountName} (${this.accountId})`);
            }
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
            const parsed = JSON.parse(data);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        }
        catch (error) {
            return {};
        }
    }
    async saveStoredTokens(tokens) {
        await fs.mkdir(path.dirname(this.config.tokenStoragePath), { recursive: true });
        await fs.writeFile(this.config.tokenStoragePath, JSON.stringify(tokens, null, 2));
    }
    async clearStoredAccount() {
        const stored = await this.loadTokens();
        if (this.isSource) {
            delete stored.source;
        }
        else {
            delete stored.destination;
        }
        await this.saveStoredTokens(stored);
        this.accountId = null;
        this.accountName = null;
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
            console.log('\nReceived response from Harvest API:');
            console.log('Status:', response.status);
            console.log('Headers:', response.headers);
            console.log('Data:', JSON.stringify(response.data, null, 2));
            return response.data.users;
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('\nError response from Harvest API:');
                console.error('Status:', error.response?.status);
                console.error('Headers:', error.response?.headers);
                console.error('Data:', error.response?.data);
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
