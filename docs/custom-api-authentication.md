# Custom API authentication

In Connections, choose the service or Custom HTTP API and supply a documented authenticated GET route for the connection test. A public homepage cannot verify an API key. In Advanced connection settings, choose Service default, Bearer token, or API key in a header. Header authentication accepts an exact header such as `X-API-Key`, `api-key` or `Authorization`, with an optional scheme prefix. The credential stays in the encrypted key store; authentication metadata contains no key.

Coolify uses a complete Bearer token, including its token ID and `|` separator. Pasting `Bearer <token>` or `Authorization: Bearer <token>` into its secure key field is accepted without duplicating the prefix. See [Coolify API authorization](https://coolify.io/docs/api/authorization). Configuring a REST connection does not register an MCP server.

Cowork teammates can call `connection_test` with the saved connection ID for a fresh read-only verification. This bypasses a cached negative auth status. Success supersedes historical failures and closes that teammate's old credential cards for the same connection across its chats. Another teammate's cards remain separate. A timeout, missing operation or scope denial must not be reported as a missing key.
