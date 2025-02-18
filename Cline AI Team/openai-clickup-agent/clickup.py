import os
import json
import requests
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

load_dotenv()

class ClickUpClient:
    def __init__(self):
        self.api_key = os.getenv("CLICKUP_API_KEY")
        self.base_url = "https://api.clickup.com/api/v2"
        
        if not self.api_key:
            raise ValueError("CLICKUP_API_KEY environment variable is required")
        
        self.headers = {"Authorization": f"{self.api_key}"}
        self.team_id = self._get_team_id()

    def _get_team_id(self) -> str:
        """Get the first team ID from the user's teams."""
        try:
            print("Getting ClickUp teams...")
            print(f"Using headers: {self.headers}")
            response = requests.get(
                f"{self.base_url}/team",
                headers=self.headers
            )
            print(f"Response status: {response.status_code}")
            print(f"Response text: {response.text}")
            response.raise_for_status()
            teams_data = response.json()
            print(f"Teams data: {json.dumps(teams_data, indent=2)}")
            
            if not teams_data.get("teams"):
                raise ValueError("No teams found in ClickUp account")
            
            team_id = teams_data["teams"][0]["id"]
            print(f"Using team ID: {team_id}")
            return team_id
            
        except Exception as e:
            print(f"Error getting team ID: {str(e)}")
            raise ValueError(f"Failed to get ClickUp team ID: {str(e)}")

    def _make_request(self, method: str, endpoint: str, params: Dict = None, data: Dict = None) -> Dict[str, Any]:
        """Make a request to the ClickUp API."""
        url = f"{self.base_url}/{endpoint}"
        try:
            print(f"Making ClickUp API request: {method} {url}")
            if data:
                print(f"Request data: {json.dumps(data, indent=2)}")
                
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                params=params,
                json=data
            )
            
            print(f"Response status code: {response.status_code}")
            
            try:
                response_data = response.json()
                print(f"Response data: {json.dumps(response_data, indent=2)}")
            except json.JSONDecodeError:
                print(f"Raw response text: {response.text}")
                return {"error": "Invalid JSON response from ClickUp API"}
            
            response.raise_for_status()
            return response_data
            
        except requests.exceptions.RequestException as e:
            error_msg = f"ClickUp API error: {str(e)}"
            print(error_msg)
            return {"error": error_msg}

    def list_spaces(self) -> Dict[str, Any]:
        """List all spaces in the workspace."""
        return self._make_request("GET", f"team/{self.team_id}/space")

    def list_lists(self, space_id: str) -> Dict[str, Any]:
        """List all lists in a space."""
        return self._make_request("GET", f"space/{space_id}/list")

    def list_tasks(self, list_id: str) -> Dict[str, Any]:
        """List all tasks in a list."""
        return self._make_request("GET", f"list/{list_id}/task")

    def create_task(self, list_id: str, name: str, description: str, **kwargs) -> Dict[str, Any]:
        """Create a new task in a list."""
        data = {
            "name": name,
            "description": description,
            **kwargs
        }
        return self._make_request("POST", f"list/{list_id}/task", data=data)

    def update_task(self, task_id: str, **kwargs) -> Dict[str, Any]:
        """Update a task."""
        return self._make_request("PUT", f"task/{task_id}", data=kwargs)

    def get_task(self, task_id: str) -> Dict[str, Any]:
        """Get task details."""
        return self._make_request("GET", f"task/{task_id}")
