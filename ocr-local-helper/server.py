"""Loopback-only OCR helper for the Office Tools online page.

The browser keeps the selected crop boundaries. This service only runs the
high-accuracy local PaddleOCR pipeline on those crops and returns results in
the same order as the uploaded files.
"""

from __future__ import annotations

import io
import json
import os
import threading
from collections.abc import Iterable, Mapping
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError


ENGINE_NAME = "PP-OCRv5_server"
MAX_BATCH = 8
MAX_IMAGE_BYTES = int(os.getenv("LOCAL_OCR_MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("LOCAL_OCR_MAX_IMAGE_PIXELS", str(40_000_000)))
DEFAULT_ORIGINS = ["https://kewuangkuang.github.io"]


def _allowed_origins() -> list[str]:
    configured = os.getenv("LOCAL_OCR_ALLOWED_ORIGINS", "")
    origins = [item.strip() for item in configured.split(",") if item.strip()]
    return origins or DEFAULT_ORIGINS


app = FastAPI(title="Office Tools Local OCR", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)

_ocr_pipeline: Any = None
_ocr_lock = threading.Lock()


def _get_ocr_pipeline() -> Any:
    """Load the Server models once, only when the first OCR request arrives."""

    global _ocr_pipeline
    if _ocr_pipeline is not None:
        return _ocr_pipeline
    with _ocr_lock:
        if _ocr_pipeline is None:
            from paddleocr import PaddleOCR

            _ocr_pipeline = PaddleOCR(
                text_detection_model_name="PP-OCRv5_server_det",
                text_recognition_model_name="PP-OCRv5_server_rec",
                use_doc_orientation_classify=True,
                use_doc_unwarping=True,
                use_textline_orientation=True,
                device=os.getenv("LOCAL_OCR_DEVICE", "cpu"),
                engine="paddle",
            )
    return _ocr_pipeline


async def _read_image(upload: UploadFile) -> np.ndarray:
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="图片为空")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="图片超过本地 OCR 大小限制")
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="图片像素过大")
            image.load()
            return np.asarray(image.convert("RGB"))
    except UnidentifiedImageError as error:
        raise HTTPException(status_code=400, detail="无法读取图片") from error


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if callable(value):
        value = value()
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", errors="replace")
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    if isinstance(value, Mapping):
        return dict(value)
    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict):
        try:
            result = to_dict()
            if isinstance(result, Mapping):
                return dict(result)
        except Exception:
            return None
    return None


def _result_payload(result: Any) -> Mapping[str, Any]:
    if isinstance(result, Mapping):
        payload: Any = dict(result)
    else:
        payload = _json_value(getattr(result, "json", None))
        if payload is None:
            payload = _json_value(result)
    if isinstance(payload, Mapping) and isinstance(payload.get("res"), Mapping):
        return payload["res"]
    return payload if isinstance(payload, Mapping) else {}


def _first_value(payload: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return None


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, Iterable):
        return list(value)
    return [value]


def _normalise_result(result: Any) -> dict[str, Any]:
    payload = _result_payload(result)
    text_values = _as_list(_first_value(payload, "rec_texts", "texts", "rec_text", "text"))
    lines = [str(value).strip() for value in text_values if str(value).strip()]
    score_values = _as_list(_first_value(payload, "rec_scores", "scores", "rec_score", "score"))
    scores: list[float] = []
    for value in score_values:
        try:
            scores.append(float(value))
        except (TypeError, ValueError):
            continue
    return {
        "text": " ".join(lines),
        "lines": lines,
        "scores": scores,
        "confidence": min(scores) if scores else None,
    }


def _first_prediction(predictions: Any) -> Any:
    if isinstance(predictions, (list, tuple)):
        return predictions[0] if predictions else None
    try:
        return next(iter(predictions))
    except TypeError:
        return predictions
    except StopIteration:
        return None


def _run_ocr(image: np.ndarray) -> dict[str, Any]:
    predictions = _get_ocr_pipeline().predict(image)
    prediction = _first_prediction(predictions)
    if prediction is None:
        return {"text": "", "lines": [], "scores": [], "confidence": None}
    return _normalise_result(prediction)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "engine": ENGINE_NAME, "model_loaded": _ocr_pipeline is not None}


@app.post("/v1/ocr")
async def ocr_single(image: UploadFile = File(...)) -> dict[str, Any]:
    return {"engine": ENGINE_NAME, "result": _run_ocr(await _read_image(image))}


@app.post("/v1/ocr/batch")
async def ocr_batch(images: list[UploadFile] = File(...)) -> dict[str, Any]:
    if not images:
        raise HTTPException(status_code=400, detail="至少上传一张图片")
    if len(images) > MAX_BATCH:
        raise HTTPException(status_code=413, detail=f"一次最多处理 {MAX_BATCH} 张图片")
    try:
        results = [_run_ocr(await _read_image(image)) for image in images]
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"本地 PaddleOCR 运行失败：{error}") from error
    return {"engine": ENGINE_NAME, "results": results}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765, reload=False)
