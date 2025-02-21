import os
import json
from typing import Optional, Dict

class TokenStorage:
    def __init__(self, storage_path: str = "tokens.json"):
        self.storage_path = storage_path
        self._ensure_storage_exists()

    def _ensure_storage_exists(self):
        """Create storage file if it doesn't exist."""
        if not os.path.exists(self.storage_path):
            self.save_tokens({})

    def save_tokens(self, tokens: Dict[str, str]) -> None:
        """Save tokens to storage."""
        with open(self.storage_path, 'w') as f:
            json.dump(tokens, f, indent=2)
        # Set restrictive permissions
        os.chmod(self.storage_path, 0o600)

    def load_tokens(self) -> Dict[str, str]:
        """Load tokens from storage."""
        try:
            with open(self.storage_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def get_access_token(self) -> Optional[str]:
        """Get the stored access token."""
        tokens = self.load_tokens()
        return tokens.get('access_token')

    def store_tokens(self, access_token: str, refresh_token: Optional[str] = None) -> None:
        """Store new tokens."""
        tokens = self.load_tokens()
        tokens['access_token'] = access_token
        if refresh_token:
            tokens['refresh_token'] = refresh_token
        self.save_tokens(tokens)

    def clear_tokens(self) -> None:
        """Clear stored tokens."""
        self.save_tokens({})
