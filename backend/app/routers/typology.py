import io
from fastapi import APIRouter, UploadFile, File, HTTPException
import numpy as np
from PIL import Image

from app.ml.registry import get_typology_model

router = APIRouter(prefix="/api/typology", tags=["typology"])


@router.get("/metrics")
def metrics():
    _, meta = get_typology_model()
    return meta["metrics"]


@router.post("/estimate")
async def estimate(file: UploadFile = File(...)):
    """Runs the actual trained CNN on the uploaded photo — real inference,
    not the client-side color heuristic used as an offline fallback."""
    model, meta = get_typology_model()
    img_size = meta["img_size"]

    try:
        raw = await file.read()
        img = Image.open(io.BytesIO(raw)).convert("RGB").resize((img_size, img_size))
    except Exception:
        raise HTTPException(400, "Could not read this file as an image.")

    arr = np.array(img).astype(np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)

    pred_fill, pred_material_probs = model.predict(arr, verbose=0)
    fill_fraction = float(pred_fill[0][0])
    mat_idx = int(np.argmax(pred_material_probs[0]))
    material = meta["materials"][mat_idx]
    confidence = float(pred_material_probs[0][mat_idx])

    volume_m3 = fill_fraction * meta["dumpster_volume_m3"]
    density = meta["density_kg_m3"][material]
    mass_kg = volume_m3 * density
    ef = meta["emission_kgco2e_per_kg"][material]
    co2e_kg = mass_kg * ef

    return {
        "predicted_fill_pct": round(fill_fraction * 100, 1),
        "predicted_material": material,
        "confidence": round(confidence, 3),
        "volume_m3": round(volume_m3, 3),
        "mass_kg": round(mass_kg, 1),
        "co2e_kg": round(co2e_kg, 2),
        "all_material_probs": {m: round(float(p), 3) for m, p in zip(meta["materials"], pred_material_probs[0])},
    }
