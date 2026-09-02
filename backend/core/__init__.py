"""
backend/core
────────────
Shared runtime for the serverless GIS Layer Navigator backend.

- config : environment-driven settings (S3 URIs, prefixes, tuning knobs)
- gisfs  : storage abstraction over S3 / local disk used by every data module
- http   : API Gateway proxy event parsing and response building
- router : path + method dispatch for grouped Lambda functions
"""
