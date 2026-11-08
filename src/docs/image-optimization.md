# Shared image optimization

`infrastructure/images/optimize.ts` exports `optimizeImage(buffer, options)` for
server-side uploads, importers and migrations. It returns WebP bytes, MIME type,
extension, output dimensions and SHA-256. Blog and catalogue uploads share the
same API route and optimizer; neither stores the uploaded original bytes.

The policy is WebP quality 82, effort 4, auto-orientation, metadata removal and a
maximum 2560px edge without enlargement. Transparency is preserved; animated or
multi-page images are rejected rather than silently flattened. Clean WebP already
within the size cap is decoded for validation and kept byte-identical to avoid
repeated lossy compression. Public uploads accept JPEG, PNG and WebP with a 10 MiB
byte limit and 40 million pixel limit; trusted imports additionally support AVIF,
GIF and TIFF with the explicit larger limits below.

## Existing RustFS images

Run from `src/` with the normal application environment configured:

```sh
pnpm images:optimize
pnpm images:optimize --apply
```

The default is a dry run; only `--apply` writes. Processing is sequential. The script paginates the full bucket, cross-checks every `MediaAsset` key against that inventory, and reports unmanaged objects, missing objects, non-images, and per-item failures. A nonzero exit status means the run was not fully successful. Review the dry-run inventory and report before applying.

Each conversion writes an immutable WebP to `images/optimized/<sha256(source object key)>/<sha256(webp bytes)>.webp` with conditional `If-None-Match: *`. It verifies the stored size, `ContentType`, SHA-256 metadata, source-key metadata, and downloaded bytes before a row-locked, stale-source-guarded update of only `objectKey`, `mimeType`, `sizeBytes`, `width`, and `height`. IDs, URLs derived from media IDs, and all other row fields remain unchanged. Objects carry `sha256`, `source-sha256`, and `source-key` metadata for importer compatibility and safe retries.

After the database swap, the exact old key is deleted only after checking no `MediaAsset` row references it. Deletion re-HEADs the source, checks its ETag and SHA-256 against the bytes read, then uses conditional `If-Match` deletion while holding a database table lock against concurrent media references. Previously optimized rows are recognized only when their deterministic target key and metadata agree; their bytes are reverified, and a rerun may finish deletion of that exact recorded source key after checking its SHA-256. It never prunes arbitrary objects. Thus the original image objects are **deleted** once the verified replacement is referenced. No original-image backup is made by this script. The JSON report includes old and new row metadata for each successful swap; retain stdout as the migration record.

Source objects over 100 MiB are rejected; image decoding is capped at 100 million pixels. The script does not alter unmapped bucket objects or attempt to infer or rewrite references outside `MediaAsset`.
