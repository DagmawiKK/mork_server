# MORK Server — paths_resolved Endpoint

This document explains the `paths_resolved` endpoint that was added to the MORK server to facilitate building byte-level trie visualizations with symbol-resolved labels.

## Summary
- Route: `GET /paths_resolved/<pattern>/<template>?max_write=N`
- Purpose: Iterate the internal PathMap (trie) and return entries as JSON objects that include both the byte path and the symbol-resolved expression.
- Output: JSON array of objects `{ "raw": "[..byte debug string..]", "expr": "(..S-Expression..)" }`
- Intended use: Frontend code can reconstruct the byte-level trie from `raw` while displaying human-readable labels from `expr` using MORK’s two-way symbol mapping.

## When to use this endpoint
- You want the exact internal trie shape (byte prefixes), not just the logical expressions.
- You still want meaningful labels; `expr` provides the fully resolved S-expression for each byte path.
- You need to pair low-level PathMap traversal with symbol-aware rendering for visualization or analysis.

If you only need human-readable text without byte-level structure, prefer the existing export formats (see Comparison below).

## Request
- Method: `GET`
- Path: `/paths_resolved/<pattern>/<template>`
- Query params:
  - `max_write` (optional, unsigned int): Limits the number of entries. Default is unlimited.

### Path parameters
`pattern` and `template` are MeTTa-style S-expressions that control selection and rendering:
- `pattern` defines what to match in the space.
- `template` defines how to render each match.

URL-encode them when calling via HTTP. For example:
- `$x` → `%24x`
- `(Edge $src $dst)` → `%28Edge%20%24src%20%24dst%29`
- `(Pair ($src $dst))` → `%28Pair%20%28%24src%20%24dst%29%29`

## Response
- Status: `200 OK` on success
- Body: JSON array of objects
  - `raw` (string): Debug-formatted byte path, e.g. `"[2, 196, 197, 198]"`
  - `expr` (string): The fully-resolved S-expression for that path using the symbol table, e.g. `"(Edge A B)"`
- Content-Type: Not explicitly set by the server. Treat as `application/json` based on body contents.

### Example response (truncated)
```json
[
  { "raw": "[2, 196, 197, 198, 32, 65, 32, 66]", "expr": "(Edge A B)" },
  { "raw": "[2, 196, 197, 198, 32, 65, 32, 67]", "expr": "(Edge A C)" }
]
```

## Examples

Dump everything as resolved byte paths (unbounded):
```bash
curl 'http://127.0.0.1:8000/paths_resolved/%24x/%24x'
```

Limit to 100 entries:
```bash
curl 'http://127.0.0.1:8000/paths_resolved/%24x/%24x?max_write=100'
```

Filter edges and render pairs:
```bash
curl 'http://127.0.0.1:8000/paths_resolved/%28Edge%20%24src%20%24dst%29/%28Pair%20%28%24src%20%24dst%29%29?max_write=100'
```

## Comparison with existing export formats
- `format=metta` (GET /export/...):
  - Returns newline-delimited readable S-expressions.
  - Great for text processing, not for reconstructing the internal byte trie.
- `format=paths` (GET /export/...):
  - Binary `.paths` stream optimized for storage/transfer; not directly human-readable.
  - Appropriate if you intend to re-import or post-process with a dedicated parser.
- `format=raw` (GET /export/...):
  - Debug-formatted raw byte paths as text.
  - Lacks symbol resolution, so labels are not human-friendly.
- `paths_resolved` (this endpoint):
  - JSON that pairs `raw` byte paths with resolved `expr` strings.
  - Ideal for building byte-level trie visualizations with readable labels.

## Behavior and limitations
- One JSON object per value encountered in the trie at or below the `pattern` prefix.
- `raw` is a point-in-time debug string for that path (sufficient to reconstruct prefixes in client code).
- `expr` is a complete, symbol-resolved S-expression for the value at that path.
- Intermediate byte prefixes do not inherently map to partial symbols; only full paths resolve to full `expr`. If you need symbol-per-prefix segmentation, that requires additional server-side APIs to expose symbol boundaries.

## Performance considerations
- `max_write` is recommended for large datasets to limit output size.
- The server performs read traversal and expression rendering; time is proportional to number of matches rendered.
- If you need bulk transfers for later re-import, prefer `format=paths` to avoid JSON overhead.

## Implementation notes (for developers)
- Handler: `PathsResolvedCmd` in `server/src/commands.rs`
  - Parses `(pattern, template)` using the same machinery as the export command.
  - Iterates the PathMap using a read zipper and witness.
  - Transforms each origin path with `(pattern, template)` and serializes the result with `serialize_sexpr_into`, which uses the symbol table for byte→symbol mapping.
  - Emits `[{"raw": <Debug path>, "expr": <Resolved S-expr>}, ...]` as a JSON array.
- Router registration: `server/src/main.rs`
  - Method: `GET`
  - Name: `paths_resolved`

## Troubleshooting
- Empty array: No matches for the given `(pattern, template)`. Try `$x`/`$x` to dump everything.
- Large outputs: Use `?max_write=N` to limit; paginate by adjusting the pattern if needed.
- Encoding errors: Ensure `pattern`/`template` are URL-encoded (especially `$`, `(`, `)`, spaces).

## Suggested client usage
- Build a byte-level trie from `raw` by splitting digits and creating prefixes like `p:2-196-197`.
- Label leaf nodes from `expr` directly.
- For intermediate nodes, avoid decoding partial byte prefixes as symbols unless you have server support for symbol-boundary queries. Use conservative hints (e.g., printable ASCII) or switch to a symbol-level trie by tokenizing `expr` into full symbols per level. 