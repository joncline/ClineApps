#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import { config } from 'dotenv';
import { format } from 'date-fns';
import { HarvestService } from './services/harvest.js';
import { TimeEntry } from './types/harvest.js';
import { OAuthConfig } from './types/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

const program = new Command();

program
  .name('harvest-migrate')
  .description('CLI tool to migrate time entries between Harvest instances')
  .version('1.0.0');

program
  .command('migrate')
  .description('Migrate time entries from one Harvest instance to another')
  .action(async () => {
    try {
      // Load configuration from environment variables
      const oauthConfig: OAuthConfig = {
        clientId: process.env.HARVEST_CLIENT_ID || '',
        clientSecret: process.env.HARVEST_CLIENT_SECRET || '',
        redirectUri: 'http://localhost:3000/oauth/callback',
        scope: 'all',
        tokenStoragePath: path.join(process.cwd(), '.tokens.json'),
      };

      // Validate configuration
      if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
        throw new Error('Missing required environment variables. Please check README for setup instructions.');
      }

      // Initialize services
      const sourceHarvest = new HarvestService(oauthConfig, true);
      const destHarvest = new HarvestService(oauthConfig, false);

      console.log('Initializing source Harvest...');
      await sourceHarvest.initialize();
      console.log('Initializing destination Harvest...');
      await destHarvest.initialize();

      // Get date for migration
      const { date } = await inquirer.prompt([
        {
          type: 'input',
          name: 'date',
          message: 'Enter the date to migrate (YYYY-MM-DD):',
          validate: (input: string) => {
            return /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Please enter a valid date in YYYY-MM-DD format';
          },
        },
      ]);

      // Fetch time entries
      console.log('Fetching time entries...');
      const timeEntries = await sourceHarvest.getTimeEntries(date);

      if (timeEntries.length === 0) {
        console.log('No time entries found for the specified date.');
        return;
      }

      // Display time entries for confirmation
      console.log('\nTime entries to migrate:');
      timeEntries.forEach((entry: TimeEntry) => {
        console.log(`- ${entry.project.name} (${entry.task.name}): ${entry.hours}h - ${entry.notes || 'No notes'}`);
      });

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to proceed with the migration?',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('Migration cancelled.');
        return;
      }

      // Perform migration
      console.log('\nMigrating time entries...');
      for (const entry of timeEntries) {
        try {
          await destHarvest.createTimeEntry(entry);
          console.log(`✓ Migrated: ${entry.project.name} - ${entry.hours}h`);
        } catch (error) {
          console.error(`✗ Failed to migrate entry for ${entry.project.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log('\nMigration completed!');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'An unknown error occurred');
      process.exit(1);
    }
  });

program.parse();
