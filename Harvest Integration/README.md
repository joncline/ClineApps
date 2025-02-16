# Harvest Time Migration Tool

A command-line tool for migrating time entries between different Harvest instances.

## Features

- Migrate time entries from one Harvest instance to another
- Interactive CLI interface
- Date-based migration
- Preview and confirmation before migration
- Detailed error reporting

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Harvest API credentials for both source and destination accounts

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Build the project:
```bash
npm run build
```

## Configuration

You'll need to set up an OAuth2 application in Harvest to use this tool.

### Setting up OAuth2 Application (One-Time Setup)

You only need to register one OAuth application that will work for both source and destination Harvest accounts:

1. Go to https://id.getharvest.com/developers
2. Click "Create New OAuth2 Application"
3. Fill in the application details:
   - Name: "Harvest Time Migration Tool" (or any name you prefer)
   - Redirect URL: `http://localhost:3000/oauth/callback`
   - Multi-Account: Yes (Important: This allows access to multiple accounts)
   - Products: Harvest
   - Scope: all
4. Click "Create Application"
5. Save the following information:
   - Client ID
   - Client Secret

The same OAuth application (using one client ID/secret) will be used to:
- Authenticate with your source Harvest account
- Authenticate with your destination Harvest account
- Handle token refresh for both accounts

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
HARVEST_CLIENT_ID=your_client_id_here
HARVEST_CLIENT_SECRET=your_client_secret_here
```

### Authentication Flow

When you run the tool for the first time:
1. Your default browser will open automatically
2. You'll be asked to authorize the application for your source Harvest account
3. After authorizing, you'll be redirected back to the tool
4. The same process will repeat for your destination Harvest account
5. The tool will save the OAuth tokens locally in `.tokens.json`

Subsequent runs will use the saved tokens and refresh them automatically when needed.

## Usage

Run the migration tool:

```bash
npm run migrate
```

The tool will:
1. Prompt you for the date to migrate (YYYY-MM-DD format)
2. Fetch time entries from the source account
3. Display the entries for review
4. Ask for confirmation before proceeding
5. Migrate the entries to the destination account

## Development

- `npm run build` - Build the TypeScript code
- `npm start` - Run the tool in development mode
- `npm run migrate` - Run the migration command directly

## Error Handling

The tool includes error handling for:
- Invalid API credentials
- Network issues
- Invalid date format
- Missing time entries
- Failed migrations

If any errors occur during migration, they will be displayed in the console with details about which entries failed to migrate.

## Notes

- The tool will only migrate time entries for a single day at a time
- Project and task IDs must exist in both Harvest instances
- Existing time entries in the destination account are not checked for duplicates
- User information is not migrated (entries are created under the authenticated user)

## License

ISC
