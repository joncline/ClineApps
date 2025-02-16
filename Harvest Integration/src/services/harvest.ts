import axios, { AxiosInstance } from 'axios';
import { TimeEntry } from '../types/harvest.js';
import { AuthService } from './auth.js';
import { OAuthConfig } from '../types/auth.js';
import inquirer from 'inquirer';

export class HarvestService {
  private client: AxiosInstance;
  private authService: AuthService;
  private isSource: boolean;
  private accountId: string | null = null;

  constructor(authConfig: OAuthConfig, isSource: boolean = true) {
    this.isSource = isSource;
    this.authService = new AuthService(authConfig);
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

  async initialize(): Promise<void> {
    try {
      console.log(`Initializing ${this.isSource ? 'source' : 'destination'} Harvest connection...`);
      
      // First get the user info
      const userResponse = await this.client.get('/users/me');
      console.log('User Response:', JSON.stringify(userResponse.data, null, 2));

      if (!userResponse.data) {
        throw new Error('Invalid response from Harvest API');
      }

      // Then get the accounts
      const accountsResponse = await axios.get('https://id.getharvest.com/api/v2/accounts', {
        headers: {
          'Authorization': `Bearer ${(await this.authService.authenticate(this.isSource)).access_token}`,
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
      accounts.forEach((account: any, index: number) => {
        console.log(`${index + 1}. ${account.name} (${account.id})`);
      });

      const { accountIndex } = await inquirer.prompt([
        {
          type: 'number',
          name: 'accountIndex',
          message: 'Select the account number to use:',
          validate: (input: number) => {
            return input > 0 && input <= accounts.length
              ? true
              : 'Please enter a valid account number';
          },
        },
      ]);

      this.accountId = accounts[accountIndex - 1].id;
      console.log(`Selected account: ${accounts[accountIndex - 1].name} (${this.accountId})`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to initialize Harvest service: ${error.message}`);
      }
      throw error;
    }
  }

  async getTimeEntries(date: string): Promise<TimeEntry[]> {
    try {
      const response = await this.client.get('/time_entries', {
        params: {
          from: date,
          to: date,
        },
      });
      return response.data.time_entries;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch time entries: ${error.message}`);
      }
      throw error;
    }
  }

  async createTimeEntry(entry: Omit<TimeEntry, 'id' | 'user'>): Promise<TimeEntry> {
    try {
      const response = await this.client.post('/time_entries', {
        project_id: entry.project.id,
        task_id: entry.task.id,
        spent_date: entry.spent_date,
        hours: entry.hours,
        notes: entry.notes,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to create time entry: ${error.message}`);
      }
      throw error;
    }
  }

  async getProjects(): Promise<any[]> {
    try {
      const response = await this.client.get('/projects');
      return response.data.projects;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch projects: ${error.message}`);
      }
      throw error;
    }
  }

  async getProjectTasks(projectId: number): Promise<any[]> {
    try {
      const response = await this.client.get(`/projects/${projectId}/task_assignments`);
      return response.data.task_assignments;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to fetch project tasks: ${error.message}`);
      }
      throw error;
    }
  }
}
