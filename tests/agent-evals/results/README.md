# Local evaluation outputs

Real-model evaluation JSON and reports are intentionally local: they can contain
provider names, prompts, rate-limit details, and volatile measurements. Run an
evaluation locally, then summarize the result with:

```bash
npm run eval:summary -- path/to/results.json
```

Commit only a deliberately reviewed, redacted baseline in a dedicated fixture
when a test needs one. Do not commit raw run logs or provider responses.
