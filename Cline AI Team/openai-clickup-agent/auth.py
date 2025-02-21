import os
from typing import Optional, Dict
import requests
from urllib.parse import quote
from dotenv import load_dotenv

load_dotenv()

class ClickUpAuth:
    def __init__(self):
        self.client_id = os.getenv("CLICKUP_CLIENT_ID")
        self.client_secret = os.getenv("CLICKUP_SECRET")
        self.redirect_uri = "http://127.0.0.1:8000/oauth/callback"
        self.encoded_redirect_uri = quote(self.redirect_uri)
        # Fix token URL to match ClickUp's documentation
        self.token_url = "https://app.clickup.com/api/v2/oauth/token"
        
        if not self.client_id or not self.client_secret:
            raise ValueError("CLICKUP_CLIENT_ID and CLICKUP_SECRET environment variables are required")

    def get_authorization_url(self) -> str:
        """Get the authorization URL for the OAuth flow."""
        # According to ClickUp docs, the scopes should be comma-separated
        scopes = ["task_write", "task_read", "space_read", "team_read", "list_read"]
        scope_string = quote(",".join(scopes))  # URL encode the entire scope string
        
        # Use the official ClickUp authorization endpoint
        auth_url = (
            "https://app.clickup.com/api"
            f"?client_id={self.client_id}"
            f"&redirect_uri={self.encoded_redirect_uri}"
            f"&response_type=code"
            f"&scope={scope_string}"
            f"&state=clickup_oauth"
        )
        print(f"\nOAuth Flow Debug:")
        print(f"Client ID: {self.client_id}")
        print(f"Redirect URI (raw): {self.redirect_uri}")
        print(f"Redirect URI (encoded): {self.encoded_redirect_uri}")
        print(f"Scopes (raw): {','.join(scopes)}")
        print(f"Scopes (encoded): {scope_string}")
        print(f"Full Auth URL: {auth_url}\n")
        return auth_url

    def get_access_token(self, code: str) -> Dict[str, str]:
        """Exchange authorization code for access token."""
        try:
            print(f"\nToken Exchange Debug:")
            print(f"Authorization Code: {code}")
            print(f"Token URL: {self.token_url}")
            
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            
            data = {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self.redirect_uri
            }
            
            print(f"Request Data (redacted):")
            safe_data = {**data}
            safe_data["client_secret"] = "[REDACTED]"
            print(f"Data: {safe_data}")
            print(f"Headers: {headers}\n")
            
            response = requests.post(
                self.token_url,
                headers=headers,
                json=data  # Send as JSON instead of form data
            )
            
            print(f"Response Status: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")
            
            try:
                response_json = response.json()
                safe_response = {k: "[REDACTED]" if k in ["access_token", "refresh_token"] else v 
                               for k, v in response_json.items()}
                print(f"Response Body: {safe_response}\n")
            except ValueError:
                print(f"Raw Response Text: {response.text}\n")
                raise ValueError("Invalid JSON in response")
            
            response.raise_for_status()
            return response_json
            
        except requests.exceptions.RequestException as e:
            print(f"Token Exchange Error: {str(e)}")
            if hasattr(e, "response"):
                print(f"Error Response Status: {e.response.status_code}")
                print(f"Error Response Headers: {dict(e.response.headers)}")
                print(f"Error Response Body: {e.response.text}\n")
            raise ValueError(f"Failed to get access token: {str(e)}")
