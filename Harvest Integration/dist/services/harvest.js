"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HarvestService = void 0;
const axios_1 = __importDefault(require("axios"));
const auth_1 = require("./auth");
class HarvestService {
    constructor(authConfig, isSource = true) {
        this.accountId = null;
        this.isSource = isSource;
        this.authService = new auth_1.AuthService(authConfig);
        this.client = axios_1.default.create({
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
            const response = await this.client.get('/users/me');
            this.accountId = response.data.accounts[0].id;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Failed to initialize Harvest service: ${error.message}`);
            }
            throw error;
        }
    }
    async getTimeEntries(date) {
        try {
            const response = await this.client.get('/time_entries', {
                params: {
                    from: date,
                    to: date,
                },
            });
            return response.data.time_entries;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Failed to fetch time entries: ${error.message}`);
            }
            throw error;
        }
    }
    async createTimeEntry(entry) {
        try {
            const response = await this.client.post('/time_entries', {
                project_id: entry.project.id,
                task_id: entry.task.id,
                spent_date: entry.spent_date,
                hours: entry.hours,
                notes: entry.notes,
            });
            return response.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Failed to create time entry: ${error.message}`);
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
            if (axios_1.default.isAxiosError(error)) {
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
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Failed to fetch project tasks: ${error.message}`);
            }
            throw error;
        }
    }
}
exports.HarvestService = HarvestService;
