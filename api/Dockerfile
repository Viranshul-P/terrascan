# Step 5.2b: the TerraScan API (map your own area). Build from the repo root:
#   docker build -f api/Dockerfile -t terrascan-api .
#   docker run --rm -p 8000:8000 terrascan-api      then open http://localhost:8000/health
FROM python:3.12.5-slim

WORKDIR /app

# Libraries first, so changing the code doesn't reinstall them.
COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

# Code, settings and the files a request reads (see .dockerignore for what is left out).
COPY src/ src/
COPY api/ api/
COPY configs/ configs/
COPY results/imagery_calibration.json results/imagery_calibration.json
# The exported model (step 5.1). It is git-ignored, so it comes from this machine's models/ folder.
COPY models/efficientnet_b0_india/seed42/model.onnx models/efficientnet_b0_india/seed42/onnx_info.json models/efficientnet_b0_india/seed42/

EXPOSE 8000
CMD ["uvicorn", "api.main:default_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
