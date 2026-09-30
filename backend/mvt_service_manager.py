"""
backend/mvt_service_manager.py
──────────────────────────────
Serverless-aware vector tile manager.

Sqlite R-Tree indexes are built ahead of time by ``scripts/build_tile_indexes.py``
and uploaded to ``GIS_TILE_INDEX_URI``. At request time a Lambda mirrors the
index it needs into /tmp once per container and serves tiles straight from it —
no per-cold-start reindexing of multi-hundred-megabyte GeoJSON.

Small layers still index on demand (bounded by ``GIS_TILE_INDEX_BUILD_LIMIT_MB``)
and the result is uploaded so the next container skips the work. Rendered .pbf
tiles are optionally written through to ``GIS_TILE_CACHE_URI``, which turns a
repeat request into a single S3 GET.
"""

import json
import os
import sqlite3
import threading
from typing import Any, Dict, Optional

from core import config, gisfs


class VectorTileManager:
    """Owns tile index lifecycle and .pbf rendering for one Lambda container."""

    def __init__(self, cache_dir: str, index_uri: str = "", tile_cache_uri: str = ""):
        # The directory is created on first use, not at import: a module-level
        # singleton must never fail to import because /tmp is unwritable.
        self.cache_dir = cache_dir
        self.index_uri = index_uri or config.TILE_INDEX_URI
        self.tile_cache_uri = tile_cache_uri or config.TILE_CACHE_URI
        self.db_connections: Dict[str, sqlite3.Connection] = {}
        self.locks: Dict[str, threading.Lock] = {}
        self.tile_memory_cache: Dict[str, bytes] = {}
        self.layer_metadata: Dict[str, Dict[str, Any]] = {}
        self._local_index: Dict[str, str] = {}

    # ── paths ────────────────────────────────────────────────────────────────

    def get_lock(self, layer_id: str) -> threading.Lock:
        if layer_id not in self.locks:
            self.locks[layer_id] = threading.Lock()
        return self.locks[layer_id]

    def _ensure_cache_dir(self) -> str:
        os.makedirs(self.cache_dir, exist_ok=True)
        return self.cache_dir

    def index_object_uri(self, layer_id: str) -> str:
        """Canonical location of the pre-built index for a layer."""
        return gisfs.join(self.index_uri, "tile_index_%s.sqlite" % layer_id)

    def get_db_path(self, layer_id: str) -> str:
        """Local path of the index, mirroring it from storage on first use."""
        cached = self._local_index.get(layer_id)
        if cached and os.path.exists(cached):
            return cached

        remote = self.index_object_uri(layer_id)
        local = gisfs.materialize(remote)
        if local:
            self._local_index[layer_id] = local
            return local

        # Not published yet — this is where an on-demand build would write it.
        return os.path.join(self._ensure_cache_dir(), "tile_index_%s.sqlite" % layer_id)

    def tile_cache_object_uri(self, layer_id: str, z: int, x: int, y: int) -> str:
        return gisfs.join(self.tile_cache_uri, layer_id, str(z), str(x), "%d.pbf" % y)

    # ── index lifecycle ──────────────────────────────────────────────────────

    def ensure_spatial_index(self, layer_id: str, geojson_path: Optional[str]) -> bool:
        """Make an index available locally, building it only when it is cheap to.

        Returns True when a usable index is on local disk.
        """
        local = self._local_index.get(layer_id)
        if local and os.path.exists(local):
            return True

        remote = self.index_object_uri(layer_id)
        if gisfs.exists(remote):
            source_mtime = gisfs.getmtime(geojson_path) if geojson_path else 0.0
            if gisfs.getmtime(remote) >= source_mtime:
                materialized = gisfs.materialize(remote)
                if materialized:
                    self._local_index[layer_id] = materialized
                    self._load_metadata(layer_id)
                    return True

        if not geojson_path or not gisfs.exists(geojson_path):
            return False

        size_mb = gisfs.getsize(geojson_path) / (1024.0 * 1024.0)
        if size_mb > config.TILE_INDEX_BUILD_LIMIT_MB:
            if gisfs.exists(remote):
                materialized = gisfs.materialize(remote)
                if materialized:
                    self._local_index[layer_id] = materialized
                    self._load_metadata(layer_id)
                    return True
            print(
                "[VectorTileManager] No published index for '%s' and the source is "
                "%.0f MB (limit %d MB). Run scripts/build_tile_indexes.py and upload "
                "to %s." % (layer_id, size_mb, config.TILE_INDEX_BUILD_LIMIT_MB, self.index_uri)
            )
            return False

        with self.get_lock(layer_id):
            local = self._local_index.get(layer_id)
            if local and os.path.exists(local):
                return True
            built = self.build_index(layer_id, geojson_path)
            if built and config.is_s3(remote):
                try:
                    gisfs.upload_file(built, remote, "application/vnd.sqlite3")
                    print("[VectorTileManager] Published index for %s to %s" % (layer_id, remote))
                except Exception as exc:
                    print("[VectorTileManager] Index upload failed for %s: %s" % (layer_id, exc))
            return bool(built)

    def build_index(self, layer_id: str, geojson_path: str,
                    destination: str = "") -> Optional[str]:
        """Build the R-Tree index for a layer. Returns the local sqlite path."""
        from mvt_service import compute_geom_bbox

        db_path = destination or os.path.join(
            self._ensure_cache_dir(), "tile_index_%s.sqlite" % layer_id
        )
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except OSError:
                pass

        print("[VectorTileManager] Building R-Tree spatial index for %s..." % layer_id)
        conn = sqlite3.connect(db_path, check_same_thread=False)
        cur = conn.cursor()
        cur.execute("PRAGMA synchronous = OFF")
        cur.execute("PRAGMA journal_mode = MEMORY")
        cur.execute(
            "CREATE TABLE features ("
            "  id INTEGER PRIMARY KEY,"
            "  geom_type TEXT,"
            "  coords_json TEXT,"
            "  props_json TEXT)"
        )
        cur.execute(
            "CREATE VIRTUAL TABLE spatial_index USING rtree(id, minx, maxx, miny, maxy)"
        )

        try:
            data = json.loads(gisfs.read_bytes(geojson_path).decode("utf-8", errors="replace"))
            features = data.get("features", [])
            total_count = len(features)
            print("[VectorTileManager] Indexing %d features from %s..." % (total_count, geojson_path))

            batch_features = []
            batch_spatial = []
            layer_minx, layer_maxx = float('inf'), float('-inf')
            layer_miny, layer_maxy = float('inf'), float('-inf')

            for idx, feat in enumerate(features):
                geom = feat.get("geometry")
                if not geom:
                    continue
                gtype = geom.get("type", "")
                coords = geom.get("coordinates", [])
                props = feat.get("properties") or {}

                bbox = compute_geom_bbox(gtype, coords)
                if not bbox:
                    continue

                minx, maxx, miny, maxy = bbox
                layer_minx = min(layer_minx, minx)
                layer_maxx = max(layer_maxx, maxx)
                layer_miny = min(layer_miny, miny)
                layer_maxy = max(layer_maxy, maxy)

                feat_id = idx + 1
                batch_features.append((
                    feat_id, gtype,
                    json.dumps(coords, separators=(',', ':')),
                    json.dumps(props, separators=(',', ':')),
                ))
                batch_spatial.append((feat_id, minx, maxx, miny, maxy))

                if len(batch_features) >= 5000:
                    cur.executemany("INSERT INTO features VALUES (?, ?, ?, ?)", batch_features)
                    cur.executemany("INSERT INTO spatial_index VALUES (?, ?, ?, ?, ?)", batch_spatial)
                    conn.commit()
                    batch_features = []
                    batch_spatial = []

            if batch_features:
                cur.executemany("INSERT INTO features VALUES (?, ?, ?, ?)", batch_features)
                cur.executemany("INSERT INTO spatial_index VALUES (?, ?, ?, ?, ?)", batch_spatial)
                conn.commit()

            self.layer_metadata[layer_id] = {
                "feature_count": total_count,
                "bounds": (
                    [layer_minx, layer_miny, layer_maxx, layer_maxy]
                    if layer_minx != float('inf') else [76.0, 8.0, 80.5, 13.6]
                ),
            }
            conn.close()
            self._local_index[layer_id] = db_path
            print("[VectorTileManager] Indexed %s (%d features)." % (layer_id, total_count))
            return db_path
        except Exception as e:
            print("[VectorTileManager] Error indexing %s: %s" % (layer_id, e))
            try:
                conn.close()
            except Exception:
                pass
            return None

    def _load_metadata(self, layer_id: str) -> None:
        """Derive bounds and feature count from an index built elsewhere."""
        if layer_id in self.layer_metadata:
            return
        conn = self.get_connection(layer_id)
        if not conn:
            return
        try:
            row = conn.execute(
                "SELECT COUNT(*), MIN(minx), MIN(miny), MAX(maxx), MAX(maxy) FROM spatial_index"
            ).fetchone()
            if row and row[0]:
                self.layer_metadata[layer_id] = {
                    "feature_count": int(row[0]),
                    "bounds": [row[1], row[2], row[3], row[4]],
                }
        except Exception as exc:
            print("[VectorTileManager] Metadata read failed for %s: %s" % (layer_id, exc))

    def get_connection(self, layer_id: str) -> Optional[sqlite3.Connection]:
        db_path = self.get_db_path(layer_id)
        if not db_path or not os.path.exists(db_path):
            return None
        if layer_id not in self.db_connections:
            # Read-only: indexes are immutable once published.
            self.db_connections[layer_id] = sqlite3.connect(
                db_path, check_same_thread=False,
            )
        return self.db_connections[layer_id]

    # ── tile rendering ───────────────────────────────────────────────────────

    def get_tile(self, layer_id: str, z: int, x: int, y: int,
                 geojson_path: Optional[str] = None) -> bytes:
        """Fetch or render the .pbf tile for ``(layer_id, z, x, y)``."""
        from mvt_service import build_mvt_tile, tile_to_bbox

        cache_key = "%s:%d:%d:%d" % (layer_id, z, x, y)
        if cache_key in self.tile_memory_cache:
            return self.tile_memory_cache[cache_key]

        # Shared cache across containers, when configured.
        if self.tile_cache_uri:
            remote_tile = self.tile_cache_object_uri(layer_id, z, x, y)
            try:
                if gisfs.exists(remote_tile):
                    tile = gisfs.read_bytes(remote_tile)
                    self._remember(cache_key, tile)
                    return tile
            except Exception as exc:
                print("[VectorTileManager] Tile cache read failed: %s" % exc)

        self.ensure_spatial_index(layer_id, geojson_path)

        conn = self.get_connection(layer_id)
        if not conn:
            return build_mvt_tile(layer_id, [], z, x, y)

        minx, miny, maxx, maxy = tile_to_bbox(z, x, y, buffer_fraction=0.08)
        rows = conn.execute(
            "SELECT f.id, f.geom_type, f.coords_json, f.props_json "
            "FROM spatial_index s JOIN features f ON s.id = f.id "
            "WHERE s.minx <= ? AND s.maxx >= ? AND s.miny <= ? AND s.maxy >= ?",
            (maxx, minx, maxy, miny),
        ).fetchall()

        # Adaptive decimation keeps low-zoom tiles small on dense point layers.
        total_rows = len(rows)
        step = 1
        if z <= 6 and total_rows > 300:
            step = max(1, total_rows // 250)
        elif z <= 8 and total_rows > 800:
            step = max(1, total_rows // 600)

        features_data = []
        for i in range(0, total_rows, step):
            fid, gtype, c_json, p_json = rows[i]
            features_data.append((fid, gtype, json.loads(c_json), json.loads(p_json)))

        tile_pbf = build_mvt_tile(layer_id, features_data, z, x, y)
        self._remember(cache_key, tile_pbf)

        if self.tile_cache_uri and tile_pbf:
            try:
                gisfs.write_bytes(
                    self.tile_cache_object_uri(layer_id, z, x, y),
                    tile_pbf,
                    "application/x-protobuf",
                )
            except Exception as exc:
                print("[VectorTileManager] Tile cache write failed: %s" % exc)

        return tile_pbf

    def _remember(self, cache_key: str, tile: bytes) -> None:
        if len(self.tile_memory_cache) > 3000:
            self.tile_memory_cache.clear()
        self.tile_memory_cache[cache_key] = tile
