#!/usr/bin/env python3
"""
PikRouter Python Client & CLI
=============================
Integrates with PikRouter (https://pikrouter.pikpam.com):
1. Sign in via email & password to retrieve a user authentication token.
2. Query the OpenAI-compatible router at https://pikrouter.pikpam.com/v1 using the user token.

Usage:
    python scripts/pikrouter_client.py --email customer@app.com --password password123 --prompt "How does sign-in auth work?"
    python scripts/pikrouter_client.py --token <JWT_TOKEN> --model gemini-1.5-flash --prompt "Hello"
"""

import os
import sys
import argparse
from typing import Optional, Dict, Any, Generator

try:
    import requests
except ImportError:
    print("Error: 'requests' package is required. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)

try:
    from openai import OpenAI
except ImportError:
    print("Error: 'openai' package is required. Install with: pip install openai", file=sys.stderr)
    sys.exit(1)

DEFAULT_AUTH_URL = "https://pikrouter.pikpam.com/api/auth/login"
DEFAULT_BASE_URL = "https://pikrouter.pikpam.com/v1"
DEFAULT_MODEL = "gemini-1.5-flash"


class PikRouterClient:
    """Client for interacting with PikRouter AI endpoint."""

    def __init__(
        self,
        token: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        auth_url: str = DEFAULT_AUTH_URL,
    ):
        self.base_url = base_url.rstrip("/")
        self.auth_url = auth_url
        self.token = token or os.getenv("PIKROUTER_TOKEN") or os.getenv("PIKROUTER_API_KEY")
        self._openai_client: Optional[OpenAI] = None

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Sign in with email and password to retrieve user token."""
        response = requests.post(
            self.auth_url,
            json={"email": email, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        if not response.ok:
            try:
                err = response.json()
                msg = err.get("error") or err.get("message") or response.text
            except Exception:
                msg = response.text
            raise RuntimeError(f"PikRouter authentication failed ({response.status_code}): {msg}")

        data = response.json()
        token = data.get("token")
        if not token:
            raise RuntimeError("Authentication succeeded but no token was returned.")

        self.token = token
        self._openai_client = None  # Reset client with new token
        return data

    @property
    def openai(self) -> OpenAI:
        """Get or initialize OpenAI client with the user's PikRouter token."""
        if not self.token:
            raise ValueError("Authentication token is required. Call login() or set PIKROUTER_TOKEN.")
        if self._openai_client is None:
            self._openai_client = OpenAI(
                api_key=self.token,
                base_url=self.base_url,
            )
        return self._openai_client

    def chat(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system_prompt: Optional[str] = None,
        stream: bool = False,
        **kwargs,
    ) -> Any:
        """Send a chat completion request to PikRouter."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        return self.openai.chat.completions.create(
            model=model,
            messages=messages,
            stream=stream,
            **kwargs,
        )

    def stream_chat(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        system_prompt: Optional[str] = None,
        **kwargs,
    ) -> Generator[str, None, None]:
        """Stream response tokens from PikRouter."""
        response = self.chat(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            stream=True,
            **kwargs,
        )
        for chunk in response:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta


def main():
    parser = argparse.ArgumentParser(description="PikRouter Python CLI")
    parser.add_argument("--email", default=os.getenv("PIKROUTER_EMAIL"), help="User login email")
    parser.add_argument("--password", default=os.getenv("PIKROUTER_PASSWORD"), help="User login password")
    parser.add_argument("--token", default=os.getenv("PIKROUTER_TOKEN"), help="Direct PikRouter auth token")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Model to query (default: {DEFAULT_MODEL})")
    parser.add_argument("--prompt", default="How does sign-in auth work?", help="Prompt to query the model")
    parser.add_argument("--stream", action="store_true", help="Stream response tokens")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="PikRouter v1 base URL")
    parser.add_argument("--auth-url", default=DEFAULT_AUTH_URL, help="PikRouter login auth URL")

    args = parser.parse_args()

    client = PikRouterClient(
        token=args.token,
        base_url=args.base_url,
        auth_url=args.auth_url,
    )

    if not client.token:
        if not args.email or not args.password:
            print("Error: Either --token or both --email and --password are required.", file=sys.stderr)
            sys.exit(1)
        print(f"Signing in to PikRouter as {args.email}...", file=sys.stderr)
        auth = client.login(args.email, args.password)
        print("Authenticated successfully.", file=sys.stderr)

    print(f"Querying PikRouter [{args.model}]: {args.prompt}\n", file=sys.stderr)

    if args.stream:
        for delta in client.stream_chat(prompt=args.prompt, model=args.model):
            sys.stdout.write(delta)
            sys.stdout.flush()
        print()
    else:
        resp = client.chat(prompt=args.prompt, model=args.model)
        print(resp.choices[0].message.content)


if __name__ == "__main__":
    main()
