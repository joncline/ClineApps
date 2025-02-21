import os
import json
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from openai import OpenAI
from dotenv import load_dotenv
from clickup import ClickUpClient
from auth import ClickUpAuth
from token_storage import TokenStorage

load_dotenv()

app = FastAPI()

# Mount the static directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize ClickUp auth and token storage
clickup_auth = ClickUpAuth()
token_storage = TokenStorage()

# Global variable to store the ClickUp client
clickup_client: Optional[ClickUpClient] = None

# Try to restore session from stored token
stored_token = token_storage.get_access_token()
if stored_token:
    try:
        print("\nRestoring ClickUp session from stored token...")
        clickup_client = ClickUpClient(stored_token)
        # Test the connection
        clickup_client.get_team_id()
        print("Successfully restored ClickUp session from stored token")
    except Exception as e:
        print(f"Failed to restore ClickUp session: {str(e)}")
        clickup_client = None
        token_storage.clear_tokens()

@app.get("/")
async def root():
    """Serve the chat interface."""
    return FileResponse('static/index.html')

@app.get("/auth/status")
async def auth_status():
    """Check authentication status."""
    global clickup_client
    is_authenticated = clickup_client is not None
    print(f"\nAuth Status Check: {'Authenticated' if is_authenticated else 'Not Authenticated'}")
    return {"authenticated": is_authenticated}

@app.get("/auth")
async def auth():
    """Start OAuth flow."""
    auth_url = clickup_auth.get_authorization_url()
    print(f"Redirecting to ClickUp OAuth URL: {auth_url}")
    return RedirectResponse(url=auth_url)

@app.get("/oauth/callback")
async def oauth_callback(
    request: Request,
    code: str = None,
    error: str = None,
    error_description: str = None,
    state: str = None
):
    """Handle OAuth callback."""
    global clickup_client
    
    print("\nOAuth Callback Debug:")
    print(f"Code: {code}")
    print(f"Error: {error}")
    print(f"Error Description: {error_description}")
    print(f"State: {state}")
    print(f"Full Query Params: {dict(request.query_params)}")
    print(f"Request URL: {request.url}")
    print(f"Request Headers: {dict(request.headers)}")

    # Verify state parameter
    if state != "clickup_oauth":
        error_msg = "Invalid state parameter"
        print(f"OAuth Error: {error_msg}")
        raise ValueError(error_msg)
    
    try:
        if error or error_description:
            error_msg = f"OAuth error: {error}. Description: {error_description}"
            print(f"OAuth Error: {error_msg}")
            raise ValueError(error_msg)
            
        if not code:
            print("No authorization code received")
            raise ValueError("No authorization code received in callback")
            
        # Exchange code for access token
        print("\nStarting token exchange...")
        token_data = clickup_auth.get_access_token(code)
        
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        
        if not access_token:
            print("No access token in response data")
            print(f"Response data keys: {token_data.keys()}")
            raise ValueError("No access token received in response")
            
        print("\nInitializing ClickUp client...")
        clickup_client = ClickUpClient(access_token)
        
        # Test the connection
        print("\nTesting ClickUp connection...")
        try:
            team_id = clickup_client.get_team_id()
            print(f"Successfully connected to ClickUp (Team ID: {team_id})")
            
            # Store tokens only after successful connection test
            token_storage.store_tokens(access_token, refresh_token)
            print("Successfully stored access token")
            
        except Exception as team_error:
            print(f"Error testing ClickUp connection: {str(team_error)}")
            raise ValueError(f"Failed to verify ClickUp access: {str(team_error)}")
        
        print("\nOAuth flow completed successfully")
        return RedirectResponse(url="/")
        
    except Exception as e:
        error_detail = f"Authentication failed: {str(e)}"
        print(f"\nError in OAuth callback: {error_detail}")
        raise HTTPException(status_code=400, detail=error_detail)

@app.get("/api")
async def api_info():
    """API information endpoint."""
    if not clickup_client:
        raise HTTPException(status_code=401, detail="Not authenticated with ClickUp")
    
    return {
        "message": "OpenAI ClickUp Agent API",
        "endpoints": {
            "/auth": "GET - Start OAuth flow",
            "/oauth/callback": "GET - OAuth callback handler",
            "/process": "POST - Process natural language requests for task management",
            "/spaces": "GET - List all available ClickUp spaces",
            "/tasks/{list_id}": "GET - List all tasks in a specific list"
        }
    }

ASSISTANT_PROMPT = """You are a task management assistant that helps create and manage tasks in ClickUp. You have direct access to the ClickUp API through the application's backend, so you can perform real actions like listing spaces, creating tasks, and more.

IMPORTANT: For commands, return EXACTLY these keywords - do not provide explanations or suggestions:

Special Commands:
1. List Spaces:
   - When user asks to "list spaces" or similar -> Return "LIST_SPACES"
   
2. Select Space:
   - When user asks to use/select a specific space -> Return "SELECT_SPACE: {space_name}"
   Example: If user says "use Jon Cline space" -> Return "SELECT_SPACE: Jon Cline"
   
3. List Tasks:
   - When user asks to list tasks -> Return "LIST_TASKS"
   
4. Create Task:
   - When user asks to create a task, return task details in this format:
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

Remember: You have real access to ClickUp through the backend API. For list/get commands, just return the command keyword and let the backend handle the API calls."""

def get_assistant_response(user_message: str) -> str:
    """Get response from OpenAI assistant."""
    try:
        print(f"\nGetting OpenAI response for message: {user_message}")
        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": ASSISTANT_PROMPT},
                {"role": "user", "content": user_message}
            ]
        )
        response_text = response.choices[0].message.content
        print(f"OpenAI Response: {response_text}")
        return response_text
    except Exception as e:
        print(f"OpenAI API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")

@app.post("/process")
async def process_request(request: Dict[str, str]):
    """Process user request and interact with ClickUp."""
    global clickup_client
    
    try:
        print("\nProcessing Request:")
        print(f"Request Data: {json.dumps(request, indent=2)}")
        
        if not clickup_client:
            print("Error: Not authenticated with ClickUp")
            raise HTTPException(status_code=401, detail="Not authenticated with ClickUp")
            
        user_message = request.get("message")
        if not user_message:
            print("Error: No message provided")
            raise HTTPException(status_code=400, detail="Message is required")

        print(f"\nUser Message: {user_message}")

        # Get AI response
        assistant_response = get_assistant_response(user_message)
        print(f"Assistant Response: {assistant_response}")

        # Handle space selection
        if assistant_response.startswith("SELECT_SPACE:"):
            space_name = assistant_response.split(":", 1)[1].strip()
            print(f"\nSelecting space: {space_name}")
            try:
                spaces = clickup_client.list_spaces()
                if "error" in spaces:
                    error_msg = f"Error listing spaces: {spaces['error']}"
                    print(f"Error: {error_msg}")
                    return {
                        "error": error_msg,
                        "assistant_response": "I had trouble accessing ClickUp spaces. Please check your credentials and try again."
                    }
                
                # Find the space by name
                space = next((s for s in spaces.get('spaces', []) if s['name'].lower() == space_name.lower()), None)
                if not space:
                    return {
                        "message": "Space not found",
                        "assistant_response": f"I couldn't find a space named '{space_name}'. Please check the space name and try again."
                    }
                
                print(f"Found space: {space['name']} (ID: {space['id']})")
                return {
                    "message": "Space selected",
                    "assistant_response": f"Selected space: {space['name']}",
                    "space": space
                }
            except Exception as e:
                error_message = f"Error selecting space: {str(e)}"
                print(f"Error: {error_message}")
                return {
                    "error": error_message,
                    "assistant_response": "I encountered an error while trying to select the space. Please try again."
                }

        # Handle list spaces command
        if assistant_response == "LIST_SPACES":
            print("\nProcessing list spaces request...")
            try:
                spaces = clickup_client.list_spaces()
                if "error" in spaces:
                    error_msg = f"Error listing spaces: {spaces['error']}"
                    print(f"Error: {error_msg}")
                    return {
                        "error": error_msg,
                        "assistant_response": "I had trouble retrieving your ClickUp spaces. Please check your credentials and try again."
                    }
                space_list = "\n".join([f"- {space['name']}" for space in spaces.get('spaces', [])])
                print(f"Found spaces: {space_list}")
                return {
                    "message": "Spaces retrieved successfully",
                    "assistant_response": f"Here are your ClickUp spaces:\n{space_list}"
                }
            except Exception as e:
                error_message = f"Error listing spaces: {str(e)}"
                print(f"Error: {error_message}")
                return {
                    "error": error_message,
                    "assistant_response": "I encountered an error while trying to list your spaces. Please try again."
                }

        # Handle task creation
        if any(phrase in user_message.lower() for phrase in ["create task", "new task", "add task"]):
            print("\nProcessing task creation request...")
            try:
                # Get the first list from the first space
                print("Getting ClickUp spaces...")
                spaces = clickup_client.list_spaces()
                if "spaces" not in spaces or not spaces["spaces"]:
                    print("Error: No spaces found")
                    raise HTTPException(status_code=404, detail="No spaces found")
                
                space_id = spaces["spaces"][0]["id"]
                print(f"Using space ID: {space_id}")
                
                print("Getting lists in space...")
                lists = clickup_client.list_lists(space_id)
                if "lists" not in lists or not lists["lists"]:
                    print("Error: No lists found")
                    raise HTTPException(status_code=404, detail="No lists found")
                
                list_id = lists["lists"][0]["id"]
                print(f"Using list ID: {list_id}")

                # Parse assistant response for task details
                print("Parsing assistant response for task details...")
                lines = assistant_response.split("\n", 1)
                task_name = lines[0].strip()
                task_description = lines[1].strip() if len(lines) > 1 else ""
                print(f"Task Name: {task_name}")
                print(f"Task Description: {task_description}")

                # Create task in ClickUp
                print("Creating task in ClickUp...")
                task = clickup_client.create_task(list_id, task_name, task_description)
                
                if "error" in task:
                    print(f"Error creating task: {task['error']}")
                    raise HTTPException(status_code=500, detail=f"ClickUp API error: {task['error']}")

                print("Task created successfully")
                return {
                    "message": "Task created successfully",
                    "assistant_response": assistant_response,
                    "task": task
                }

            except Exception as e:
                error_message = f"Error creating task: {str(e)}"
                print(f"Error: {error_message}")
                return {
                    "error": error_message,
                    "assistant_response": "I encountered an error while trying to create the task. Please make sure your ClickUp credentials are correct and try again."
                }
        
        # Default response for other requests
        print("Processing default request...")
        return {
            "message": "Request processed",
            "assistant_response": assistant_response
        }

    except Exception as e:
        error_message = f"Error processing request: {str(e)}"
        print(f"Error: {error_message}")
        return {
            "error": error_message,
            "assistant_response": "I encountered an error while processing your request. Please try again."
        }

@app.get("/spaces")
async def list_spaces():
    """List all ClickUp spaces."""
    global clickup_client
    if not clickup_client:
        raise HTTPException(status_code=401, detail="Not authenticated with ClickUp")
        
    try:
        spaces = clickup_client.list_spaces()
        if "error" in spaces:
            raise HTTPException(status_code=500, detail=f"ClickUp API error: {spaces['error']}")
        return spaces
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/tasks/{list_id}")
async def list_tasks(list_id: str):
    """List all tasks in a specific list."""
    global clickup_client
    if not clickup_client:
        raise HTTPException(status_code=401, detail="Not authenticated with ClickUp")
        
    try:
        tasks = clickup_client.list_tasks(list_id)
        if "error" in tasks:
            raise HTTPException(status_code=500, detail=f"ClickUp API error: {tasks['error']}")
        return tasks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
