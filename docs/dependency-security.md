# Production dependency security

Run `npm ci`, `npm audit --omit=dev`, and `npm run build` when updating the
production dependency tree. Commit `package.json` and `package-lock.json`
together. Do not use `npm audit fix --force`: its proposed fixes can downgrade
ExcelJS and PptxGenJS instead of updating their affected dependencies.

The scoped overrides in `package.json` bridge these upstream version ranges:

| Parent                          | Override            | Compatibility                                                                                                                                         |
| ------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ag-ui/client`, `@ag-ui/proto` | Zod `^4.6.7`        | AG-UI's client and core schemas import `zod/v4`; core accepts Zod 4 as a peer. The older Zod 3 package also bundled an affected Zod 4 implementation. |
| `exceljs`                       | UUID `^11.1.1`      | ExcelJS uses the CommonJS `v4` export for conditional formatting. UUID 11 preserves that export; later ESM-only majors are not substituted.           |
| `pptxgenjs`                     | image-size `^2.0.4` | Keeps PptxGenJS 4 and removes the vulnerable image parser from the installed tree. Document tests cover slides containing image media.                |

Remove an override once its parent declares a patched compatible range. Verify
the resolved versions with `npm ls --omit=dev zod uuid image-size nodemailer undici`.

`tests/dependency-compatibility.test.ts` covers oversized Zod collections,
the complete Gitu AG-UI client pipeline, nested email-address comments in both
outgoing MIME and incoming parsing, and Excel conditional-formatting UUIDs.
Mail tests use an in-memory transport and send no email.

Security references:

- [Zod collection size checks](https://github.com/colinhacks/zod/pull/6652)
- [UUID buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [image-size parser denial of service](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
- [Nodemailer nested address comments](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8)
- [Undici response content encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c)
