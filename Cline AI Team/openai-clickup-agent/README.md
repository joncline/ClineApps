# OpenAI ClickUp Agent

A FastAPI-based agent that integrates OpenAI's GPT models with ClickUp for intelligent task management.

## Features

- Create tasks in ClickUp using natural language
- AI-powered task description formatting
- List spaces and tasks
- RESTful API endpoints for ClickUp integration

## Setup

1. Clone the repository
2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create a `.env` file based on `.env.example` and fill in your API keys:
```bash
cp .env.example .env
```

Required environment variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `CLICKUP_API_KEY`: Your ClickUp API key
- `MASTER_SPACE_ID`: Your ClickUp workspace/team ID

## Running the Application

Start the FastAPI server:
```bash
python app.py
```

The server will run at `http://localhost:8000`

## API Endpoints

### POST /process
Process a natural language request to create or manage tasks.

Request body:
```json
{
    "message": "create task Write documentation for the API"
}
```

### GET /spaces
List all available ClickUp spaces.

### GET /tasks/{list_id}
List all tasks in a specific list.

## Example Usage

### Creating a Task
```bash
curl -X POST http://localhost:8000/process \
  -H "Content-Type: application/json" \
  -d '{"message": "create task Write documentation for the new feature"}'
```

### Listing Spaces
```bash
curl http://localhost:8000/spaces
```

### Listing Tasks
```bash
curl http://localhost:8000/tasks/your_list_id
```

## How It Works

1. The agent uses OpenAI's GPT models to understand natural language requests
2. For task creation, it formats the task with clear objectives and acceptance criteria
3. The formatted task is then created in ClickUp using their API
4. All communication with ClickUp is handled through a dedicated client class

## Notes

- The agent will create tasks in the first list of the first space by default
- Task descriptions are automatically formatted with sections for Objective, Details, and Acceptance Criteria
- The API uses GPT-4-turbo-preview for optimal task understanding and formatting
