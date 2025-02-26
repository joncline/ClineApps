#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import { config } from 'dotenv';
import { HarvestService } from './services/harvest.js';
import { MappingService } from './services/mapping.js';
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
async function loadConfig() {
    const config = {
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
async function showMainMenu(sourceHarvest, destHarvest) {
    console.log('\n=== HARVEST TIME MIGRATION TOOL ===');
    const sourceInfo = sourceHarvest?.getAccountInfo();
    const destInfo = destHarvest?.getAccountInfo();
    console.log(`Source Account: ${sourceInfo ? `${sourceInfo.name} (${sourceInfo.id})` : 'Not configured'}`);
    console.log(`Destination Account: ${destInfo ? `${destInfo.name} (${destInfo.id})` : 'Not configured'}`);
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                {
                    name: sourceInfo
                        ? `Use Source Account: ${sourceInfo.name} (${sourceInfo.id})`
                        : 'Configure Source Account',
                    value: 'source'
                },
                {
                    name: '➕ Add New Source Account',
                    value: 'new_source'
                },
                {
                    name: '❌ Remove Source Account',
                    value: 'remove_source',
                    disabled: !sourceInfo
                },
                {
                    name: destInfo
                        ? `Use Destination Account: ${destInfo.name} (${destInfo.id})`
                        : 'Configure Destination Account',
                    value: 'dest'
                },
                {
                    name: '➕ Add New Destination Account',
                    value: 'new_dest'
                },
                {
                    name: '❌ Remove Destination Account',
                    value: 'remove_dest',
                    disabled: !destInfo
                },
                {
                    name: 'Perform Migration',
                    value: 'migrate',
                    disabled: !sourceInfo || !destInfo
                },
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
        let sourceHarvest = null;
        let destHarvest = null;
        while (true) {
            const action = await showMainMenu(sourceHarvest, destHarvest);
            if (action === 'exit') {
                console.log('Goodbye!');
                process.exit(0);
            }
            if (action === 'source' || action === 'new_source') {
                console.log('\n=== SOURCE HARVEST SETUP ===');
                sourceHarvest = new HarvestService(config, true);
                if (action === 'new_source') {
                    await sourceHarvest.clearStoredAccount();
                }
                await sourceHarvest.initialize();
                continue;
            }
            if (action === 'remove_source') {
                console.log('\n=== REMOVING SOURCE ACCOUNT ===');
                if (sourceHarvest) {
                    await sourceHarvest.clearStoredAccount();
                    sourceHarvest = null;
                }
                continue;
            }
            if (action === 'dest' || action === 'new_dest') {
                console.log('\n=== DESTINATION HARVEST SETUP ===');
                console.log('Note: You can use the same Harvest account as source, but select a different account if available.');
                destHarvest = new HarvestService(config, false);
                if (action === 'new_dest') {
                    await destHarvest.clearStoredAccount();
                }
                await destHarvest.initialize();
                continue;
            }
            if (action === 'remove_dest') {
                console.log('\n=== REMOVING DESTINATION ACCOUNT ===');
                if (destHarvest) {
                    await destHarvest.clearStoredAccount();
                    destHarvest = null;
                }
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
                if (users.length === 0) {
                    console.log('No active users found in source account.');
                    continue;
                }
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
                        validate: (input) => {
                            return /^\d{4}-\d{2}-\d{2}$/.test(input) || 'Please enter a valid date in YYYY-MM-DD format';
                        },
                    },
                ]);
                // Ensure both services are initialized
                console.log('\nVerifying Harvest connections...');
                await sourceHarvest.initialize();
                await destHarvest.initialize();
                // Initialize mapping service
                const mappingService = new MappingService(sourceHarvest, destHarvest);
                // Create initial mapping
                console.log('\nSetting up entity mappings...');
                let mapping = await mappingService.createMapping(selectedUser.id);
                // Fetch time entries
                console.log('Fetching time entries...');
                const timeEntries = await sourceHarvest.getTimeEntries(date, selectedUser.id);
                if (timeEntries.length === 0) {
                    console.log('No time entries found for the specified date.');
                    continue;
                }
                // Display time entries for confirmation
                console.log(`\nTime entries to migrate for ${selectedUser.first_name} ${selectedUser.last_name}:`);
                timeEntries.forEach((entry) => {
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
                    let success = false;
                    while (!success) {
                        const projectMapping = mapping.projects.get(entry.project.id);
                        if (!projectMapping) {
                            console.log(`⚠️ No mapping found for project: ${entry.project.name}`);
                            break;
                        }
                        const taskId = projectMapping.tasks.get(entry.task.id);
                        if (!taskId) {
                            console.log(`⚠️ No mapping found for task: ${entry.task.name}`);
                            break;
                        }
                        const result = await destHarvest.createTimeEntry(entry, {
                            projectId: projectMapping.destinationId,
                            taskId: taskId,
                            userId: mapping.user.destinationId
                        });
                        if (result.success) {
                            console.log(`✓ Migrated: ${entry.project.name} - ${entry.hours}h`);
                            success = true;
                        }
                        else {
                            console.error(`✗ Failed to migrate entry: ${result.error}`);
                            const { action } = await inquirer.prompt([
                                {
                                    type: 'list',
                                    name: 'action',
                                    message: 'How would you like to proceed?',
                                    choices: [
                                        { name: 'Remap entities and retry', value: 'remap' },
                                        { name: 'Skip this entry', value: 'skip' },
                                        { name: 'Quit migration', value: 'quit' }
                                    ]
                                }
                            ]);
                            if (action === 'remap') {
                                mapping = await mappingService.remapFailedEntry(mapping, entry);
                            }
                            else if (action === 'skip') {
                                console.log('Skipping entry...');
                                break;
                            }
                            else {
                                console.log('Migration cancelled.');
                                return;
                            }
                        }
                    }
                }
                console.log('\nMigration completed!');
            }
            catch (error) {
                console.error('Error:', error instanceof Error ? error.message : 'An unknown error occurred');
            }
        }
    }
    catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'An unknown error occurred');
        process.exit(1);
    }
});
program.parse();
