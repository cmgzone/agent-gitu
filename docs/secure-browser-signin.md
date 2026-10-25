# Secure website and service credentials

Cowork agents can use `request_browser_auth` after navigating their private
browser to a visible HTTPS form. The card shows the actual website address,
its same-origin favicon (or a letter fallback), and the fields detected on the
page. Modes are `signin`, `signup`, and `verify`. Signup requires write access.

The user fills the card in Gitu. Only the authenticated HTTPS endpoint receives
the values; they never enter model tool arguments, transcripts, or request
metadata. Values travel over the existing authenticated computer transport on
stdin. The browser service fills its captured form and submits once. The agent
then checks the result instead of assuming authentication succeeded. Website
sessions remain in that agent's persistent browser profile.

Cards expire after fifteen minutes and bind to a computer, page, origin, and
form action. Changed destinations, stale cards, replays, human desktop control,
and required agreements left unchecked prevent submission. Sign-up terms are
shown for the user to choose. CAPTCHA or unsupported forms still use the human
desktop handoff. Passwords are redacted from later browser text results and
cleared from captured inputs after the attempt. This is not a password manager.

Service connection cards also accept named credentials through `auth.fields`.
All field values are encrypted by the existing key vault; only field definitions
are saved in connection and request metadata. Supported transports:

- `basic`: `usernameField` and `passwordField` select the named fields.
- `headers`: each field specifies its documented `header` and optional `prefix`.
- `oauth2`: `client_id`, `client_secret`, a documented same-origin `tokenPath`
  or explicit HTTPS `tokenUrl`, and optional `scope`. `grantType` defaults to
  `client_credentials`; `password` also needs API username and password fields
  (mapped with `usernameField`/`passwordField` when their IDs differ). Client
  authentication defaults to form fields; `clientAuthentication: "basic"` uses
  the documented Basic client scheme. Requests are form-urlencoded. The host
  caches tokens only until their declared expiry, refreshes when possible, and
  otherwise reauthenticates from the encrypted vault. Tokens stay in bounded,
  account-scoped memory. Neither secrets nor token response bodies enter chat.
  Read requests may refresh a rejected token once; writes are never replayed.
  Existing API-key/Bearer connections keep working.

Contabo's existing OAuth profiles are corrected in place to its documented
password grant and `https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token`.
Their field IDs, vault entries, connection IDs, operations and grants are
preserved. The required values are client ID, client secret, API username and
the separate **API password**, not a server SSH password. Verification uses
`GET https://api.contabo.com/v1/compute/instances` with a fresh `x-request-id`.
See the [official Contabo API documentation](https://api.contabo.com/).

Token failures report sanitized categories: invalid credentials, invalid
configuration, network failure, token endpoint failure, or invalid token
response. Provider error descriptions and response bodies are never included.
New identity-provider token URLs must be established by official setup docs;
redirects never forward credentials to another destination.

Example metadata (values are entered only in the secure card):

```json
{
  "type": "oauth2",
  "tokenPath": "/oauth/token",
  "fields": [
    {"id":"email","label":"Account email","inputType":"email","secret":false},
    {"id":"client_id","label":"Client ID","secret":false},
    {"id":"client_secret","label":"Client secret","secret":true}
  ]
}
```

`ask_user` remains the path for non-secret questions and choices. Both Cowork
execution adapters also persist clear direct questions as cards if a model
omits the tool. Credential requests are excluded from that fallback. Deploy
the private-computer broker before the web app when updating the desktop image.
