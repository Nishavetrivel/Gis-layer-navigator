"""
backend/core/gisfs.py
─────────────────────
Storage abstraction used by every data module in place of ``os`` / ``open``.

A "path" here is a URI:

    s3://bucket/prefix/file.geojson   → served from S3
    /var/data/file.geojson            → served from local disk

The API deliberately mirrors the subset of ``os`` / ``os.path`` the original
FastAPI backend used, so call sites change shape only where they must:

    os.path.exists(p)   → gisfs.exists(p)
    open(p, "rb")       → gisfs.open_binary(p)          (returns BytesIO)
    open(p, "r")        → gisfs.read_text(p)
    os.listdir(d)       → gisfs.listdir(d)
    os.walk(root)       → gisfs.walk(root)
    os.path.getmtime(p) → gisfs.getmtime(p)

Two extras exist for readers that demand a real seekable file on disk
(``sqlite3``, ``pyshp``, ``zipfile.write``):

    gisfs.materialize(p) → downloads once into /tmp and returns a real path
    gisfs.local_writable(p) → a /tmp path plus an ``upload()`` callback

Directory listings are cached per container with a TTL; materialised files are
cached under an LRU byte budget so warm invocations reuse them for free.
"""

import io
import json
import os
import posixpath
import shutil
import threading
import time
from typing import Any, Dict, Iterator, List, Optional, Tuple

from core import config

# ─── S3 CLIENT ────────────────────────────────────────────────────────────────

_s3_client = None
_s3_lock = threading.Lock()


def s3():
    """Lazily-created, thread-safe boto3 S3 client (boto3 ships in the runtime)."""
    global _s3_client
    if _s3_client is None:
        with _s3_lock:
            if _s3_client is None:
                import boto3
                from botocore.config import Config as BotoConfig

                _s3_client = boto3.client(
                    "s3",
                    config=BotoConfig(
                        max_pool_connections=32,
                        retries={"max_attempts": 3, "mode": "adaptive"},
                        read_timeout=60,
                        connect_timeout=5,
                    ),
                )
    return _s3_client


def _is_s3(uri: str) -> bool:
    return bool(uri) and str(uri).startswith("s3://")


def _split(uri: str) -> Tuple[str, str]:
    rest = str(uri)[len("s3://"):]
    bucket, _, key = rest.partition("/")
    return bucket, key


def join(base: str, *parts: str) -> str:
    """Join path segments, preserving the ``s3://`` scheme."""
    if _is_s3(base):
        out = str(base).rstrip("/")
        for p in parts:
            if p in (None, ""):
                continue
            out = out + "/" + str(p).strip("/")
        return out
    return os.path.join(base, *[str(p) for p in parts if p not in (None, "")])


def basename(uri: str) -> str:
    if _is_s3(uri):
        return posixpath.basename(str(uri).rstrip("/"))
    return os.path.basename(uri)


def dirname(uri: str) -> str:
    if _is_s3(uri):
        return posixpath.dirname(str(uri).rstrip("/"))
    return os.path.dirname(uri)


def splitext(uri: str) -> Tuple[str, str]:
    if _is_s3(uri):
        return posixpath.splitext(str(uri))
    return os.path.splitext(uri)


def normalize(uri: str) -> str:
    """Canonical form used as a cache key (case-insensitive on local Windows paths)."""
    if _is_s3(uri):
        return str(uri).rstrip("/")
    return os.path.normcase(os.path.abspath(uri))


# ─── DIRECTORY LISTING CACHE ──────────────────────────────────────────────────
# S3 has no directories, so a "listing" is one paginated list_objects_v2 sweep
# of a prefix, cached per container. Cheap for warm invocations, one round of
# LIST calls per cold start per prefix actually touched.

class _Listing:
    __slots__ = ("entries", "fetched_at")

    def __init__(self, entries: Dict[str, Tuple[int, float]]):
        self.entries = entries          # relative key -> (size, epoch mtime)
        self.fetched_at = time.time()

    def is_fresh(self) -> bool:
        return (time.time() - self.fetched_at) < config.LISTING_TTL_SECONDS


_listings: Dict[str, _Listing] = {}
_listing_lock = threading.Lock()


def _fetch_s3_listing(prefix_uri: str) -> _Listing:
    bucket, key_prefix = _split(prefix_uri)
    key_prefix = key_prefix.strip("/")
    search = (key_prefix + "/") if key_prefix else ""

    entries: Dict[str, Tuple[int, float]] = {}
    paginator = s3().get_paginator("list_objects_v2")
    count = 0
    for page in paginator.paginate(Bucket=bucket, Prefix=search):
        for obj in page.get("Contents") or []:
            k = obj["Key"]
            if k.endswith("/"):
                continue
            rel = k[len(search):] if search else k
            if not rel:
                continue
            mtime = obj["LastModified"].timestamp() if obj.get("LastModified") else 0.0
            entries[rel] = (int(obj.get("Size") or 0), mtime)
            count += 1
            if count >= config.LISTING_MAX_KEYS:
                break
        if count >= config.LISTING_MAX_KEYS:
            break
    return _Listing(entries)


def _get_listing(prefix_uri: str) -> _Listing:
    ck = normalize(prefix_uri)
    cached = _listings.get(ck)
    if cached is not None and cached.is_fresh():
        return cached
    with _listing_lock:
        cached = _listings.get(ck)
        if cached is not None and cached.is_fresh():
            return cached
        listing = _fetch_s3_listing(prefix_uri)
        _listings[ck] = listing
        return listing


def invalidate_listing(prefix_uri: str = "") -> None:
    """Drop cached listings — all of them when no prefix is given."""
    with _listing_lock:
        if prefix_uri:
            _listings.pop(normalize(prefix_uri), None)
        else:
            _listings.clear()


def _find_listing_root(uri: str) -> Optional[str]:
    """Return an already-cached ancestor prefix that covers ``uri``, if any."""
    ck = normalize(uri)
    best = None
    for root in _listings:
        if ck.startswith(root + "/") and (best is None or len(root) > len(best)):
            best = root
    return best


# ─── EXISTENCE / METADATA ─────────────────────────────────────────────────────

_head_cache: Dict[str, Optional[Tuple[int, float]]] = {}
_head_lock = threading.Lock()


def _head(uri: str) -> Optional[Tuple[int, float]]:
    """(size, mtime) for an S3 object, or None. Answered from a cached listing
    when one covers the key, otherwise a single HeadObject."""
    ck = normalize(uri)
    if ck in _head_cache:
        return _head_cache[ck]

    root = _find_listing_root(uri)
    if root is not None:
        listing = _listings[root]
        if listing.is_fresh():
            rel = ck[len(root) + 1:]
            found = listing.entries.get(rel)
            with _head_lock:
                _head_cache[ck] = found
            return found

    bucket, key = _split(uri)
    try:
        resp = s3().head_object(Bucket=bucket, Key=key)
        info = (
            int(resp.get("ContentLength") or 0),
            resp["LastModified"].timestamp() if resp.get("LastModified") else 0.0,
        )
    except Exception:
        info = None
    with _head_lock:
        _head_cache[ck] = info
    return info


def exists(uri: str) -> bool:
    if not uri:
        return False
    if _is_s3(uri):
        return _head(uri) is not None
    try:
        return os.path.exists(uri)
    except (OSError, ValueError):
        return False


def isfile(uri: str) -> bool:
    if not uri:
        return False
    if _is_s3(uri):
        return _head(uri) is not None
    return os.path.isfile(uri)


def isdir(uri: str) -> bool:
    """True when the URI names a prefix that holds at least one object."""
    if not uri:
        return False
    if _is_s3(uri):
        bucket, key = _split(uri)
        prefix = (key.strip("/") + "/") if key.strip("/") else ""
        try:
            resp = s3().list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
            return int(resp.get("KeyCount") or 0) > 0
        except Exception:
            return False
    return os.path.isdir(uri)


def getsize(uri: str) -> int:
    if _is_s3(uri):
        info = _head(uri)
        return info[0] if info else 0
    try:
        return os.path.getsize(uri)
    except OSError:
        return 0


def getmtime(uri: str) -> float:
    if _is_s3(uri):
        info = _head(uri)
        return info[1] if info else 0.0
    try:
        return os.path.getmtime(uri)
    except OSError:
        return 0.0


# ─── READING ──────────────────────────────────────────────────────────────────

def read_bytes(uri: str) -> bytes:
    if _is_s3(uri):
        bucket, key = _split(uri)
        return s3().get_object(Bucket=bucket, Key=key)["Body"].read()
    with open(uri, "rb") as fh:
        return fh.read()


def read_range(uri: str, start: int, length: int) -> bytes:
    """Byte-range read — lets the shapefile/DBF parsers avoid whole-file pulls."""
    end = start + length - 1
    if _is_s3(uri):
        bucket, key = _split(uri)
        rng = "bytes=%d-%d" % (start, end)
        return s3().get_object(Bucket=bucket, Key=key, Range=rng)["Body"].read()
    with open(uri, "rb") as fh:
        fh.seek(start)
        return fh.read(length)


def read_text(uri: str, encoding: str = "utf-8") -> str:
    return read_bytes(uri).decode(encoding, errors="replace")


def read_json(uri: str) -> Any:
    return json.loads(read_bytes(uri).decode("utf-8", errors="replace"))


def open_binary(uri: str) -> io.BytesIO:
    """Seekable in-memory handle. Drop-in for ``open(path, 'rb')``."""
    return io.BytesIO(read_bytes(uri))


def open_text(uri: str, encoding: str = "utf-8") -> io.StringIO:
    return io.StringIO(read_text(uri, encoding))


def iter_body(uri: str, chunk_size: int = 1 << 20) -> Iterator[bytes]:
    """Stream an object without holding it all in memory."""
    if _is_s3(uri):
        bucket, key = _split(uri)
        body = s3().get_object(Bucket=bucket, Key=key)["Body"]
        while True:
            chunk = body.read(chunk_size)
            if not chunk:
                break
            yield chunk
        return
    with open(uri, "rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            yield chunk


# ─── LISTING ──────────────────────────────────────────────────────────────────

def listdir(uri: str) -> List[str]:
    """Immediate children (files and pseudo-directories) of a prefix."""
    if not uri:
        return []
    if _is_s3(uri):
        bucket, key = _split(uri)
        prefix = (key.strip("/") + "/") if key.strip("/") else ""
        names: List[str] = []
        try:
            paginator = s3().get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix, Delimiter="/"):
                for cp in page.get("CommonPrefixes") or []:
                    names.append(cp["Prefix"][len(prefix):].rstrip("/"))
                for obj in page.get("Contents") or []:
                    name = obj["Key"][len(prefix):]
                    if name and "/" not in name:
                        names.append(name)
        except Exception as exc:
            print("[gisfs] listdir failed for %s: %s" % (uri, exc))
        return names
    try:
        return os.listdir(uri)
    except OSError:
        return []


def walk(root: str) -> Iterator[Tuple[str, List[str], List[str]]]:
    """``os.walk``-compatible traversal.

    For S3 this replays one cached recursive listing, so a full sweep of a
    prefix costs a single set of LIST calls per container rather than one per
    directory level.
    """
    if not root:
        return
    if not _is_s3(root):
        for triple in os.walk(root):
            yield triple
        return

    listing = _get_listing(root)
    base = str(root).rstrip("/")
    tree: Dict[str, Tuple[List[str], List[str]]] = {}

    for rel in listing.entries:
        parts = rel.split("/")
        for depth in range(len(parts)):
            parent = base if depth == 0 else base + "/" + "/".join(parts[:depth])
            dirs, files = tree.setdefault(parent, ([], []))
            leaf = parts[depth]
            if depth == len(parts) - 1:
                if leaf not in files:
                    files.append(leaf)
            elif leaf not in dirs:
                dirs.append(leaf)

    for dirpath in sorted(tree):
        dirs, files = tree[dirpath]
        yield dirpath, sorted(dirs), sorted(files)


def list_names_with_prefix(dir_uri: str, name_prefix: str) -> List[str]:
    """Files directly under ``dir_uri`` whose name starts with ``name_prefix``.

    On S3 this pushes the filter into the LIST call, so scanning a flat bucket
    holding every village in the state costs one narrow request rather than a
    full enumeration.
    """
    if not dir_uri or not name_prefix:
        return []
    if _is_s3(dir_uri):
        bucket, key = _split(dir_uri)
        base = (key.strip("/") + "/") if key.strip("/") else ""
        out: List[str] = []
        try:
            paginator = s3().get_paginator("list_objects_v2")
            for page in paginator.paginate(
                Bucket=bucket, Prefix=base + name_prefix, Delimiter="/"
            ):
                for obj in page.get("Contents") or []:
                    name = obj["Key"][len(base):]
                    if name and "/" not in name:
                        out.append(name)
        except Exception as exc:
            print("[gisfs] prefix listing failed for %s%s: %s" % (dir_uri, name_prefix, exc))
        return out
    try:
        return [n for n in os.listdir(dir_uri) if n.startswith(name_prefix)]
    except OSError:
        return []


def glob_files(root: str, suffixes: Tuple[str, ...]) -> List[str]:
    """All files under ``root`` whose lowercase name ends with one of ``suffixes``."""
    out: List[str] = []
    lowered = tuple(s.lower() for s in suffixes)
    for dirpath, _dirs, files in walk(root):
        for fname in files:
            if fname.lower().endswith(lowered):
                out.append(join(dirpath, fname))
    return out


# ─── /tmp MATERIALISATION (LRU) ───────────────────────────────────────────────
# sqlite3 and pyshp need a real seekable file. Downloads are cached across warm
# invocations and evicted least-recently-used once the byte budget is exceeded.

_materialized: Dict[str, str] = {}      # normalized uri -> local path
_mat_atime: Dict[str, float] = {}       # normalized uri -> last use
_mat_size: Dict[str, int] = {}          # normalized uri -> bytes on disk
_mat_lock = threading.Lock()


def _cache_slot(uri: str) -> str:
    import hashlib

    digest = hashlib.sha1(normalize(uri).encode("utf-8")).hexdigest()[:16]
    safe = basename(uri) or "object.bin"
    return os.path.join(config.LOCAL_CACHE_DIR, digest, safe)


def _evict_until(free_needed: int) -> None:
    """Drop LRU entries until the budget accommodates ``free_needed`` more bytes."""
    budget = config.LOCAL_CACHE_BUDGET_MB * 1024 * 1024
    used = sum(_mat_size.values())
    if used + free_needed <= budget:
        return
    for ck, _ts in sorted(_mat_atime.items(), key=lambda kv: kv[1]):
        if used + free_needed <= budget:
            break
        path = _materialized.get(ck)
        size = _mat_size.get(ck, 0)
        if not path:
            continue
        try:
            shutil.rmtree(os.path.dirname(path), ignore_errors=True)
        except OSError:
            pass
        _materialized.pop(ck, None)
        _mat_atime.pop(ck, None)
        _mat_size.pop(ck, None)
        used -= size
        print("[gisfs] evicted %s (%d bytes) from /tmp cache" % (path, size))


def materialize(uri: str, sidecars: Tuple[str, ...] = ()) -> Optional[str]:
    """Ensure ``uri`` exists as a real local file and return its path.

    ``sidecars`` names extra extensions to pull alongside a base file — used for
    shapefiles, where pyshp needs ``.shx``/``.dbf``/``.cpg`` next to the ``.shp``.
    Returns ``None`` when the object does not exist.
    """
    if not uri:
        return None
    if not _is_s3(uri):
        return uri if os.path.exists(uri) else None

    ck = normalize(uri)
    cached = _materialized.get(ck)
    if cached and os.path.exists(cached):
        _mat_atime[ck] = time.time()
        return cached

    with _mat_lock:
        cached = _materialized.get(ck)
        if cached and os.path.exists(cached):
            _mat_atime[ck] = time.time()
            return cached

        info = _head(uri)
        if info is None:
            return None
        size = info[0]

        _evict_until(size)
        local = _cache_slot(uri)
        os.makedirs(os.path.dirname(local), exist_ok=True)
        bucket, key = _split(uri)
        tmp = local + ".part"
        try:
            s3().download_file(bucket, key, tmp)
            os.replace(tmp, local)
        except Exception as exc:
            print("[gisfs] materialize failed for %s: %s" % (uri, exc))
            try:
                os.remove(tmp)
            except OSError:
                pass
            return None

        _materialized[ck] = local
        _mat_atime[ck] = time.time()
        _mat_size[ck] = size

        # Pull requested sidecars into the same directory so relative lookups work.
        stem_uri = splitext(uri)[0]
        stem_local = os.path.splitext(local)[0]
        for ext in sidecars:
            side_uri = stem_uri + ext
            if not exists(side_uri):
                continue
            side_local = stem_local + ext
            try:
                s_bucket, s_key = _split(side_uri)
                s3().download_file(s_bucket, s_key, side_local)
                _mat_size[ck] = _mat_size.get(ck, 0) + getsize(side_uri)
            except Exception as exc:
                print("[gisfs] sidecar %s failed: %s" % (side_uri, exc))
        return local


SHAPEFILE_SIDECARS = (".shx", ".dbf", ".prj", ".cpg", ".sbn", ".sbx", ".qpj")


def materialize_shapefile(uri: str) -> Optional[str]:
    """Materialise a ``.shp`` together with the sidecars pyshp needs."""
    return materialize(uri, sidecars=SHAPEFILE_SIDECARS)


def local_cache_stats() -> Dict[str, Any]:
    return {
        "entries": len(_materialized),
        "bytes": sum(_mat_size.values()),
        "budget_bytes": config.LOCAL_CACHE_BUDGET_MB * 1024 * 1024,
    }


# ─── WRITING ──────────────────────────────────────────────────────────────────

def write_bytes(uri: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    if _is_s3(uri):
        bucket, key = _split(uri)
        s3().put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
        with _head_lock:
            _head_cache[normalize(uri)] = (len(data), time.time())
        return
    os.makedirs(os.path.dirname(uri) or ".", exist_ok=True)
    with open(uri, "wb") as fh:
        fh.write(data)


def write_text(uri: str, text: str, content_type: str = "text/plain; charset=utf-8") -> None:
    write_bytes(uri, text.encode("utf-8"), content_type)


def write_json(uri: str, obj: Any) -> None:
    write_bytes(
        uri,
        json.dumps(obj, ensure_ascii=False).encode("utf-8"),
        "application/json",
    )


def upload_file(local_path: str, uri: str, content_type: str = "application/octet-stream") -> None:
    if _is_s3(uri):
        bucket, key = _split(uri)
        s3().upload_file(local_path, bucket, key, ExtraArgs={"ContentType": content_type})
        return
    os.makedirs(os.path.dirname(uri) or ".", exist_ok=True)
    shutil.copyfile(local_path, uri)


def presign(uri: str, expires: Optional[int] = None, filename: str = "") -> str:
    """Pre-signed GET URL for an S3 object (used to offload large responses)."""
    bucket, key = _split(uri)
    params: Dict[str, Any] = {"Bucket": bucket, "Key": key}
    if filename:
        params["ResponseContentDisposition"] = 'attachment; filename="%s"' % filename
    return s3().generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=int(expires or config.PRESIGN_TTL_SECONDS),
    )
