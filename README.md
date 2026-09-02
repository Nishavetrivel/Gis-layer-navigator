# GIS Layer Navigator

A GIS web application for browsing, visualising, and downloading geospatial
boundary layers (Districts, Taluks, Villages) with map rendering and
multi-format export.

The backend is **serverless**: 23 endpoints, each implemented as its own
handler module, deployed across eight AWS Lambda functions behind API Gateway,
reading GIS data from S3. Infrastructure is defined in `template.yaml`
(CloudFormation via AWS SAM) and configured in `samconfig.toml`.

---

## Project Structure

```
gis-layer-navigator/
│
├── frontend/                      ← React + TypeScript UI
│   ├── App.tsx                      Main application component
│   ├── main.tsx                     React entry point
│   └── components/                  GisMap, NavigationPanel, SearchBar, …
│
├── backend/                       ← Serverless Python backend
│   │
│   ├── core/                        Shared runtime
│   │   ├── config.py                  Env-driven settings (every path is a URI)
│   │   ├── gisfs.py                   Storage abstraction over S3 / local disk
│   │   ├── http.py                    API Gateway event parsing & responses
│   │   ├── router.py                  Path + method dispatch within a function
│   │   └── asyncutil.py               Sync bridge for the async services
│   │
│   ├── handlers/                    One module per endpoint
│   │   ├── hierarchy/                 districts, taluks, villages, parcels,
│   │   │                              metadata, search
│   │   ├── cart/                      list_definitions, list_paths, get_layer
│   │   ├── tiles/                     vector_tile, fmb_tile, tile_metadata
│   │   ├── spatial/                   resolve, viewport, clip_preview,
│   │   │                              clip_download
│   │   ├── geo/                       geojson, auto_zoom_layer
│   │   ├── export/                    export, download_direct, download_zip,
│   │   │                              export_polygon, _export_core
│   │   └── ai/                        chat
│   │
│   ├── functions/                   Eight Lambda entrypoints, one per group
│   │   ├── hierarchy_api/app.py       → HierarchyFunction
│   │   ├── cart_api/app.py            → CartLayersFunction
│   │   ├── tiles_api/app.py           → TilesFunction
│   │   ├── spatial_api/app.py         → SpatialFunction
│   │   ├── clip_api/app.py            → ClipFunction
│   │   ├── geojson_api/app.py         → GeoJsonFunction
│   │   ├── export_api/app.py          → ExportFunction
│   │   └── ai_api/app.py              → AiChatFunction
│   │
│   ├── services/                    Domain logic (storage-agnostic)
│   │   ├── geometry_service.py        SHP/DBF parsers, bbox maths, caching
│   │   ├── cart_layer_service.py      Thematic overlay registry & discovery
│   │   ├── geojson_builder.py         Hierarchical boundary merging
│   │   ├── spatial_clip_service.py    Polygon clipping & feature collection
│   │   └── hierarchy_resolver.py      Point-in-polygon & viewport resolution
│   │
│   ├── db.py                        GIS index & storage scanner
│   ├── mvt_service.py               MVT protobuf encoder (pure computation)
│   ├── mvt_service_manager.py       Tile index lifecycle & tile caching
│   ├── zip_bundler.py               Native Shapefile ZIP packaging
│   ├── format_exporter.py           KML, KMZ, DXF, GeoJSON, Shapefile export
│   ├── shp_exporter.py              In-memory Shapefile writer
│   └── local_server.py              Dev server driving the real handlers
│
├── layers/                        ← Lambda dependency layers
│   ├── gis_core/requirements.txt    shapely, pyshp (all functions)
│   └── gis_ai/requirements.txt      google-genai (AI function only)
│
├── scripts/
│   ├── sync_data_to_s3.py           Upload the GIS tree to the data bucket
│   ├── build_tile_indexes.py        Build & publish sqlite R-Tree indexes
│   ├── build_startup_cache.py       Pre-render the hot whole-state payloads
│   └── smoke_test.py                Invoke all 23 endpoints locally
│
├── template.yaml                  ← CloudFormation / SAM infrastructure
├── samconfig.toml                 ← SAM CLI config (dev / staging / prod)
├── env.local.json                 ← Env vars for `sam local`
└── data/                          ← GIS data (local dev only; S3 in AWS)
```

---

## Endpoints → Functions → API Gateway

Every endpoint has its own handler module and its own API Gateway resource.
Handlers are grouped into functions that share a warm data cache, which keeps
cold starts down without coupling the code.

| Function | Memory / Timeout | Endpoints |
|---|---|---|
| `HierarchyFunction` | 1024 MB / 29 s | `GET /api/districts`, `/api/taluks`, `/api/villages`, `/api/parcels`, `/api/metadata`, `/api/search` |
| `CartLayersFunction` | 2048 MB / 29 s | `GET /api/cart-layers`, `/api/cart-layers/list`, `/api/cart-layer/{layer_id}` |
| `TilesFunction` | 2048 MB / 29 s | `GET /api/tiles/{layer_id}/{z}/{x}/{y}.pbf`, `/api/tiles/{layer_id}/metadata`, `/api/fmb-tiles/{z}/{x}/{y}.pbf` |
| `SpatialFunction` | 3008 MB / 29 s | `GET /api/spatial/resolve`, `/api/spatial/viewport` |
| `ClipFunction` | 10240 MB / 300 s | `POST /api/spatial/clip/preview`, `/api/spatial/clip/download` |
| `GeoJsonFunction` | 3008 MB / 60 s | `GET /api/geojson`, `/api/auto-zoom-layer` |
| `ExportFunction` | 5120 MB / 300 s | `GET /api/export`, `/api/download-zip`, `/api/download/{level}/{code}`, `POST /api/export-polygon` |
| `AiChatFunction` | 512 MB / 60 s | `POST /api/ai/chat` |

Two routes are bound to greedy `{proxy+}` resources because an API Gateway path
parameter must occupy a whole path segment — `{y}.pbf` and a code containing a
slash are not expressible as templates:

- `/api/tiles/{proxy+}` serves both the tile and metadata routes.
- `/api/download/{proxy+}` carries survey codes such as `12/1B`.

---

## Data lives in S3, never in the deployment package

Every path the backend touches is a URI resolved through `core/gisfs.py`, so
the same code reads `s3://bucket/gis/...` in Lambda and `./data/...` locally.
The layout under `GIS_DATA_URI` is:

```
<prefix>/official_names.json                 district / taluk / village names
<prefix>/cart_layers/*.geojson               thematic overlays
<prefix>/cache/tile_index_*.sqlite           pre-built R-Tree tile indexes
<prefix>/cache/merged_village_fast.geojson   statewide village layer
<prefix>/cache/startup_all_*.json            pre-rendered hot payloads
<prefix>/vector/dd/tt/vvv/…                  village & parcel layers
<prefix>/District 2/, <prefix>/Taluk 5/      district & taluk boundaries
<prefix>/fmb/district_01_merged_fmb.geojson  merged FMB boundaries
<prefix>/tn_village_boundary/…               statewide boundary source
```

Any of these can be relocated individually with the `GIS_*_URI` environment
variables listed in `backend/core/config.py`.

Three behaviours exist because Lambda is not a long-lived server:

- **Tile indexes are built ahead of time.** The water-bodies index alone is
  ~170 MB; building it in-request is not viable. `scripts/build_tile_indexes.py`
  publishes them, and each container mirrors only the index it needs into
  `/tmp` under an LRU byte budget.
- **The startup warm-up became a build step.** The FastAPI server pre-merged
  every district and taluk in a background thread on boot.
  `scripts/build_startup_cache.py` does that once and stores the result, which
  `/api/geojson` serves straight as bytes.
- **Oversized responses are offloaded.** API Gateway caps a proxy response at
  6 MB. Anything larger is written to the artifact bucket and returned as a 302
  to a pre-signed URL, so large exports and the 40 MB village layer still work.

---

## Setup & Run (local)

```bash
pip install -r requirements.txt
npm install
```

Run the backend and the frontend in two terminals:

```bash
npm run dev:api     # handler server on :8000 (same code path as Lambda)
npm run dev         # Vite on :5173, proxying /api to :8000
```

`backend/local_server.py` builds a real API Gateway proxy event for each
request and invokes the same `lambda_handler` that runs in production, so
there is no second code path to keep in sync. For higher fidelity (real
containers, real layers) use `npm run sam:local` instead.

Check every endpoint at once:

```bash
npm run api:smoke            # invokes all 23 handlers, prints status + timing
python scripts/smoke_test.py --verbose
```

---

## Deploy

**Requires AWS SAM CLI ≥ 1.103** — earlier versions (including 1.90) cannot
build the `python3.12` runtime and their bundled `cfn-lint` rejects it. Check
with `sam --version`; upgrade before the first build.

```bash
# 1. Validate
sam validate --template template.yaml

# 2. Build (containerised: shapely and pyshp need Linux arm64 wheels)
sam build --use-container

# 3. Deploy — creates the buckets, layers, API and eight functions
sam deploy --config-env dev
```

Then load the data and the derived artefacts:

```bash
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name gis-layer-navigator-dev \
  --query "Stacks[0].Outputs[?OutputKey=='DataBucket'].OutputValue" --output text)

python scripts/sync_data_to_s3.py --bucket "$BUCKET" --source ./data

# Extra trees that are not under ./data (LOCAL_PATH:REMOTE_SUBPREFIX)
python scripts/sync_data_to_s3.py --bucket "$BUCKET" \
  --extra-root "D:/OneDrive - FarmwiseAI Private Limited/vector:vector" \
  --extra-root "C:/Users/…/District 2:District 2"

python scripts/build_tile_indexes.py --data-uri "s3://$BUCKET/gis" --publish
python scripts/build_startup_cache.py --data-uri "s3://$BUCKET/gis"
```

Point the frontend at the deployed stage:

```bash
VITE_API_BASE_URL=$(aws cloudformation describe-stacks \
  --stack-name gis-layer-navigator-dev \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" --output text) \
  npm run dev
```

### Stack parameters

| Parameter | Default | Purpose |
|---|---|---|
| `Stage` | `dev` | API Gateway stage and resource name suffix |
| `DataBucketName` | *(empty)* | Reuse an existing data bucket; empty creates one |
| `DataPrefix` | `gis` | Key prefix for the GIS tree |
| `CorsAllowOrigin` | `*` | Set to the real web origin in production |
| `GeminiSecretArn` | *(empty)* | Secrets Manager ARN for the AI assistant key |
| `LogRetentionDays` | `30` | CloudWatch Logs retention |
| `EnableTileCache` | `true` | Write rendered `.pbf` back to S3 |
| `EnableProvisionedConcurrency` | `false` | Keep tile/geojson functions warm (costs money) |

Staging and production presets live in `samconfig.toml`:

```bash
sam deploy --config-env staging
sam deploy --config-env prod        # set CorsAllowOrigin first
```

### AI assistant key

```bash
aws secretsmanager create-secret --name gis-navigator/gemini \
  --secret-string '{"GEMINI_API_KEY":"…"}'

sam deploy --config-env dev \
  --parameter-overrides GeminiSecretArn=arn:aws:secretsmanager:…:gis-navigator/gemini
```

Only `AiChatFunction` is granted `secretsmanager:GetSecretValue`, and only on
that one secret.

---

## Export Formats Supported

| Format | Extension | Description |
|--------|-----------|-------------|
| Shapefile | `.zip` | Standard GIS format (ArcGIS, QGIS) |
| GeoJSON | `.geojson` | Open standard geographic format |
| KML | `.kml` | Google Earth format |
| KMZ | `.kmz` | Compressed Google Earth format |
| AutoCAD | `.dxf` | CAD format for engineering tools |
