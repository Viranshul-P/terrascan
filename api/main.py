"""Step 5.2b: the TerraScan API, used only for "map your own area" on the website.

  GET  /health   -> {"status": "ok", ...}  The website calls this to see if the API is awake.
  POST /predict  {"bbox": [west, south, east, north], "year": "2026"}
                 -> a land-use map of the box (format: src/live.py map_box).

The showcase cities never need this API: they are static files (web/public/data, step 5.2a).
Run from the repo root:  uvicorn api.main:default_app --factory --port 8000
"""

import asyncio

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.live import BoxError, load_context, map_box

CONFIG = "configs/api.yaml"


class PredictRequest(BaseModel):
    bbox: list[float]  # west, south, east, north in degrees (lon/lat)
    year: str


def create_app(ctx):
    """The FastAPI app. ctx comes from src.live.load_context (tests pass a fake model)."""
    cfg = ctx["cfg"]
    app = FastAPI(title="TerraScan API")
    app.add_middleware(CORSMiddleware, allow_origins=cfg["cors_origins"],
                       allow_methods=["GET", "POST"], allow_headers=["*"])

    @app.get("/health")
    def health():
        return {"status": "ok", "years": list(cfg["years"]), "max_side_km": cfg["max_side_km"],
                "timeout_s": cfg["timeout_s"]}

    @app.post("/predict")
    async def predict(request: PredictRequest):
        # The work runs in a separate thread so the time limit can be checked. Python can't stop
        # that thread, so after a timeout it still finishes its current reads in the background.
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(map_box, request.bbox, request.year, ctx),
                timeout=cfg["timeout_s"])
        except BoxError as error:
            raise HTTPException(status_code=422, detail=str(error))
        except TimeoutError:
            raise HTTPException(status_code=504, detail=(
                f"Mapping took longer than {cfg['timeout_s']} seconds (the satellite pictures "
                "were slow to download). Please try again, or draw a smaller box."))

    return app


def default_app():
    """For uvicorn --factory: loads the real model and settings from configs/api.yaml."""
    return create_app(load_context(CONFIG))
