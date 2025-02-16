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

async function loadConfig(): Promise<OAuthConfig> {
  const config: OAuthConfig = {
    clientId: process.env.HARVEST_CLIENT_ID || '',
    clientSecret: process.env.HARVEST_CLIENT_SECRET || '',
    redirectUri: 'http://localhost:3000/oauth/callback',
    scope: 'all',
    tokenStoragePath: path.join(process.cwd(), '.tokens.json'),
  };

  if (!config.clientId || !config.clientSecret) {
    throw new Error('Missing required environment variables. Please check README for setup instructions.');
  }

  return config;
}

async function showMainMenu(sourceHarvest: HarvestService | null, destHarvest: HarvestService | null) {
  console.log('\n=== HARVEST TIME MIGRATION TOOL ===');
  
  const sourceInfo = sourceHarvest?.getAccountInfo();
  console.log(`Source Account: ${sourceInfo ? `${sourceInfo.name} (${sourceInfo.id})` : 'Not configured'}`);
  
  const destInfo = destHarvest?.getAccountInfo();
  console.log(`Destination Account: ${destInfo ? `${destInfo.name} (${destInfo.id})` : 'Not configured'}`);

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Configure Source Account', value: 'source' },
        { name: 'Configure Destination Account', value: 'dest' },
        { name: 'Perform Migration', value: 'migrate' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);

  return action;
}

program
  .command('migrate')
  .description('Migrate time entries between Harvest instances')
  .action(async () => {
    try {
      const config = await loadConfig();
      let sourceHarvest: HarvestService | null = null;
      let destHarvest: HarvestService | null = null;

      while (true) {
        const action = await showMainMenu(sourceHarvest, destHarvest);

        if (action === 'exit') {
          console.log('Goodbye!');
          process.exit(0);
        }

        if (action === 'source') {
          console.log('\n=== SOURCE HARVEST SETUP ===');
          sourceHarvest = new HarvestService(config, true);
          await sourceHarvest.initialize();
          continue;
        }

        if (action === 'dest') {
          console.log('\n=== DESTINATION HARVEST SETUP ===');
          console.log('Note: You can use the same Harvest account as source, but select a different account if available.');
          destHarvest = new HarvestService(config, false);
          await destHarvest.initialize();
          continue;
        }

        // Proceed with migration
        if (!sourceHarvest || !destHarvest) {
          console.log('\nError: Please configure both source and destination accounts first.');
          continue;
        }

        try {
      // Get users from source account
      console.log('\nFetching users from source account...');
      const users = await sourceHarvest.getUsers();
      
      // Let user select which user's entries to migrate
      const { selectedUser } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedUser',
          message: 'Select user to migrate time entries for:',
          choices: users.map(user => ({
            name: `${user.first_name} ${user.last_name} (${user.email})`,
            value: user
          }))
        }
      ]);

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
          const timeEntries = await sourceHarvest.getTimeEntries(date, selectedUser.id);

          if (timeEntries.length === 0) {
            console.log('No time entries found for the specified date.');
            continue;
          }

          // Display time entries for confirmation
          console.log(`\nTime entries to migrate for ${selectedUser.first_name} ${selectedUser.last_name}:`);
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
            continue;
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
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'An unknown error occurred');
      process.exit(1);
    }
  });

program.parse();
