import os
from typing import Dict, List
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from openai import OpenAI
from dotenv import load_dotenv
from clickup import ClickUpClient
import os

load_dotenv()

app = FastAPI()

# Mount the static directory
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    """Serve the chat interface."""
    return FileResponse('static/index.html')

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
clickup = ClickUpClient()

@app.get("/api")
async def api_info():
    """API information endpoint."""
    return {
        "message": "OpenAI ClickUp Agent API",
        "endpoints": {
            "/process": "POST - Process natural language requests for task management",
            "/spaces": "GET - List all available ClickUp spaces",
            "/tasks/{list_id}": "GET - List all tasks in a specific list"
        }
    }

ASSISTANT_PROMPT = """You are a task management assistant that helps create and manage tasks in ClickUp.
When a user asks to create a task, respond with the task name on the first line, followed by a structured description.

Example response format:
Update Documentation
Objective:
- Create comprehensive documentation for the new feature

Details:
- Document API endpoints
- Include usage examples
- Add troubleshooting section

Acceptance Criteria:
- Documentation is clear and accurate
- All endpoints are documented
- Examples are provided for each feature
- Troubleshooting guide is included

For other requests like listing spaces or tasks, provide a clear and helpful response based on the available information."""

def get_assistant_response(user_message: str) -> str:
    """Get response from OpenAI assistant."""
    try:
        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": ASSISTANT_PROMPT},
                {"role": "user", "content": user_message}
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")

@app.post("/process")
async def process_request(request: Dict[str, str]):
    """Process user request and interact with ClickUp."""
    user_message = request.get("message")
    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    # Get AI response
    assistant_response = get_assistant_response(user_message)

    # If the message indicates task creation
    if any(phrase in user_message.lower() for phrase in ["create task", "new task", "add task"]):
        try:
            # Get the first list from the first space
            spaces = clickup.list_spaces()
            if "spaces" not in spaces or not spaces["spaces"]:
                raise HTTPException(status_code=404, detail="No spaces found")
            
            space_id = spaces["spaces"][0]["id"]
            lists = clickup.list_lists(space_id)
            if "lists" not in lists or not lists["lists"]:
                raise HTTPException(status_code=404, detail="No lists found")
            
            list_id = lists["lists"][0]["id"]

            # Parse assistant response for task details
            # Assuming the assistant formats the response with task name and description
            lines = assistant_response.split("\n", 1)
            task_name = lines[0].strip()
            task_description = lines[1].strip() if len(lines) > 1 else ""

            # Create task in ClickUp
            task = clickup.create_task(list_id, task_name, task_description)
            
            if "error" in task:
                raise HTTPException(status_code=500, detail=f"ClickUp API error: {task['error']}")

            return {
                "message": "Task created successfully",
                "assistant_response": assistant_response,
                "task": task
            }

        except Exception as e:
            error_message = f"Error creating task: {str(e)}"
            return {
                "error": error_message,
                "assistant_response": "I encountered an error while trying to create the task. Please make sure your ClickUp credentials are correct and try again."
            }

    # For other types of requests
    try:
        # For list spaces request
        if "list spaces" in user_message.lower():
            spaces = clickup.list_spaces()
            if "error" in spaces:
                return {
                    "error": f"Error listing spaces: {spaces['error']}",
                    "assistant_response": "I had trouble retrieving your ClickUp spaces. Please check your credentials and try again."
                }
            space_list = "\n".join([f"- {space['name']}" for space in spaces.get('spaces', [])])
            return {
                "message": "Spaces retrieved successfully",
                "assistant_response": f"Here are your ClickUp spaces:\n{space_list}"
            }
        
        # Default response for other requests
        return {
            "message": "Request processed",
            "assistant_response": assistant_response
        }
    except Exception as e:
        error_message = f"Error processing request: {str(e)}"
        return {
            "error": error_message,
            "assistant_response": "I encountered an error while processing your request. Please try again."
        }

@app.get("/spaces")
async def list_spaces():
    """List all ClickUp spaces."""
    try:
        spaces = clickup.list_spaces()
        if "error" in spaces:
            raise HTTPException(status_code=500, detail=f"ClickUp API error: {spaces['error']}")
        return spaces
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/tasks/{list_id}")
async def list_tasks(list_id: str):
    """List all tasks in a specific list."""
    try:
        tasks = clickup.list_tasks(list_id)
        if "error" in tasks:
            raise HTTPException(status_code=500, detail=f"ClickUp API error: {tasks['error']}")
        return tasks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
