import os
import json
import requests
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

load_dotenv()

class ClickUpClient:
    def __init__(self, access_token: str):
        self.base_url = "https://api.clickup.com/api/v2"
        self.access_token = access_token
        
        if not self.access_token:
            raise ValueError("Access token is required")
        
        self.headers = {"Authorization": f"Bearer {self.access_token}"}
        self.team_id = None  # Will be set when needed

    def get_team_id(self) -> str:
        """Get the first team ID from the user's teams."""
        if self.team_id:
            return self.team_id

        try:
            print("\nGetting ClickUp teams...")
            # Redact token when logging headers
            logged_headers = {**self.headers, "Authorization": "Bearer [REDACTED]"}
            print(f"Using headers: {logged_headers}")
            
            url = f"{self.base_url}/team"
            print(f"Making request to: {url}")
            
            response = requests.get(url, headers=self.headers)
            
            print(f"Response Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")
            
            response.raise_for_status()
            teams_data = response.json()
            print(f"Teams Response: {json.dumps(teams_data, indent=2)}")
            
            if not isinstance(teams_data, dict):
                raise ValueError("Invalid response format from ClickUp API")
            
            teams = teams_data.get("teams")
            if not teams:
                raise ValueError("No teams found in ClickUp account. Please ensure you have access to at least one team.")
            
            self.team_id = teams[0]["id"]
            print(f"Using team ID: {self.team_id}")
            return self.team_id
            
        except Exception as e:
            if isinstance(e, requests.exceptions.HTTPError):
                if e.response.status_code == 401:
                    raise ValueError("Invalid or expired access token. Please re-authenticate.")
                elif e.response.status_code == 403:
                    raise ValueError("Insufficient permissions to access ClickUp teams.")
                elif e.response.status_code == 429:
                    raise ValueError("ClickUp API rate limit exceeded. Please try again later.")
            print(f"Error getting team ID: {str(e)}")
            if hasattr(e, 'response'):
                print(f"Error Response: {e.response.text}")
            raise ValueError(f"Failed to get ClickUp team ID: {str(e)}")

    def _make_request(self, method: str, endpoint: str, params: Dict = None, data: Dict = None) -> Dict[str, Any]:
        """Make a request to the ClickUp API."""
        url = f"{self.base_url}/{endpoint}"
        try:
            print(f"\nMaking ClickUp API request:")
            print(f"Method: {method}")
            print(f"URL: {url}")
            print(f"Headers: {dict(self.headers)}")
            if params:
                print(f"Query Params: {params}")
            if data:
                print(f"Request Body: {json.dumps(data, indent=2)}")
                
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                params=params,
                json=data
            )
            
            print(f"\nResponse Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")
            
            try:
                response_data = response.json()
                print(f"Response Body: {json.dumps(response_data, indent=2)}")
                response.raise_for_status()
                return response_data
            except json.JSONDecodeError:
                print(f"Raw Response Text: {response.text}")
                raise ValueError("Invalid JSON response from ClickUp API")
            
        except requests.exceptions.RequestException as e:
            print(f"\nAPI Request Error:")
            print(f"Error Type: {type(e).__name__}")
            print(f"Error Message: {str(e)}")
            
            if isinstance(e, requests.exceptions.HTTPError):
                status_code = e.response.status_code
                print(f"HTTP Status Code: {status_code}")
                print(f"Response Body: {e.response.text}")
                
                if status_code == 401:
                    raise ValueError("Invalid ClickUp API key or unauthorized access")
                elif status_code == 403:
                    raise ValueError("Insufficient permissions for this operation")
                elif status_code == 404:
                    raise ValueError("Requested resource not found")
                elif status_code == 429:
                    raise ValueError("ClickUp API rate limit exceeded")
                else:
                    raise ValueError(f"ClickUp API error (HTTP {status_code}): {str(e)}")
            elif isinstance(e, requests.exceptions.ConnectionError):
                raise ValueError("Failed to connect to ClickUp API. Please check your internet connection.")
            elif isinstance(e, requests.exceptions.Timeout):
                raise ValueError("ClickUp API request timed out. Please try again.")
            else:
                raise ValueError(f"ClickUp API error: {str(e)}")

    def list_spaces(self) -> Dict[str, Any]:
        """List all spaces in the workspace."""
        print("\nListing ClickUp Spaces:")
        team_id = self.get_team_id()
        print(f"Using Team ID: {team_id}")
        return self._make_request("GET", f"team/{team_id}/space")

    def list_lists(self, space_id: str) -> Dict[str, Any]:
        """List all lists in a space."""
        print(f"\nListing ClickUp Lists for Space {space_id}:")
        return self._make_request("GET", f"space/{space_id}/list")

    def list_tasks(self, list_id: str) -> Dict[str, Any]:
        """List all tasks in a list."""
        print(f"\nListing ClickUp Tasks for List {list_id}:")
        return self._make_request("GET", f"list/{list_id}/task")

    def create_task(self, list_id: str, name: str, description: str, **kwargs) -> Dict[str, Any]:
        """Create a new task in a list."""
        print(f"\nCreating ClickUp Task in List {list_id}:")
        data = {
            "name": name,
            "description": description,
            **kwargs
        }
        return self._make_request("POST", f"list/{list_id}/task", data=data)

    def update_task(self, task_id: str, **kwargs) -> Dict[str, Any]:
        """Update a task."""
        print(f"\nUpdating ClickUp Task {task_id}:")
        return self._make_request("PUT", f"task/{task_id}", data=kwargs)

    def get_task(self, task_id: str) -> Dict[str, Any]:
        """Get task details."""
        print(f"\nGetting ClickUp Task {task_id}:")
        return self._make_request("GET", f"task/{task_id}")
