import io
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import numpy as np
from PIL import Image

from app.ml.registry import get_contamination_model

router = APIRouter(prefix="/api/contamination", tags=["contamination"])


@router.get("/metrics")
def metrics():
    _, meta = get_contamination_model()
    return meta["metrics"]


@router.get("/bin-types")
def bin_types():
    _, meta = get_contamination_model()
    return {"bin_types": meta["bin_types"]}


@router.post("/scan")
async def scan(file: UploadFile = File(...), bin_type: str = Form(...)):
    """Real inference from the multi-input CNN: image + declared bin type,
    exactly as it was trained — not the client-side heuristic fallback."""
    model, meta = get_contamination_model()
    if bin_type not in meta["bin_types"]:
        raise HTTPException(400, f"bin_type must be one of {meta['bin_types']}")

    img_size = meta["img_size"]
    try:
        raw = await file.read()
        img = Image.open(io.BytesIO(raw)).convert("RGB").resize((img_size, img_size))
    except Exception:
        raise HTTPException(400, "Could not read this file as an image.")

    arr = np.array(img).astype(np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)
    bin_onehot = np.zeros((1, len(meta["bin_types"])), dtype=np.float32)
    bin_onehot[0, meta["bin_types"].index(bin_type)] = 1.0

    pred_pct, pred_class_probs = model.predict({"image": arr, "bin_type": bin_onehot}, verbose=0)
    contam_pct = float(pred_pct[0][0]) * 100
    cls_idx = int(np.argmax(pred_class_probs[0]))
    dominant = meta["contaminant_classes"][cls_idx]
    confidence = float(pred_class_probs[0][cls_idx])
    is_contaminated = contam_pct > meta["alert_threshold_pct"]

    return {
        "bin_type": bin_type,
        "contamination_pct": round(contam_pct, 1),
        "dominant_contaminant": dominant,
        "confidence": round(confidence, 3),
        "is_contaminated": is_contaminated,
        "alert_threshold_pct": meta["alert_threshold_pct"],
    }
