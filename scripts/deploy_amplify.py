import json
import subprocess
import urllib.request
import os

APP_ID = "d1f6hbqigi4wkf"
BRANCH = "main"
REGION = "ap-south-1"
ZIP_PATH = os.path.abspath("dist.zip")

print("1. Creating Amplify deployment...")
cmd = f"aws amplify create-deployment --app-id {APP_ID} --branch-name {BRANCH} --region {REGION}"
output = subprocess.check_output(cmd, shell=True, encoding="utf-8")
data = json.loads(output)
job_id = data["jobId"]
upload_url = data["zipUploadUrl"]
print(f"Deployment created. Job ID: {job_id}")

print(f"2. Uploading {ZIP_PATH} ({os.path.getsize(ZIP_PATH)} bytes) to S3...")
with open(ZIP_PATH, "rb") as f:
    zip_bytes = f.read()

req = urllib.request.Request(upload_url, data=zip_bytes, method="PUT")
req.add_header("Content-Type", "application/zip")
with urllib.request.urlopen(req) as resp:
    print(f"Upload complete. HTTP {resp.status}")

print(f"3. Starting deployment for job {job_id}...")
start_cmd = f"aws amplify start-deployment --app-id {APP_ID} --branch-name {BRANCH} --job-id {job_id} --region {REGION}"
start_out = subprocess.check_output(start_cmd, shell=True, encoding="utf-8")
print(start_out)
print("Deployment started successfully!")
