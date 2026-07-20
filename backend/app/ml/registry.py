"""Loads every trained model artifact once at app startup, so routers
can call real .predict() on live request data instead of returning
anything precomputed."""
import json
import os
import joblib

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")

_cache = {}


def _load_json(name):
    with open(os.path.join(ARTIFACT_DIR, name)) as f:
        return json.load(f)


def get_overflow_models():
    if "overflow" not in _cache:
        reg = joblib.load(os.path.join(ARTIFACT_DIR, "overflow_regressor.joblib"))
        clf = joblib.load(os.path.join(ARTIFACT_DIR, "overflow_classifier.joblib"))
        meta = _load_json("overflow_meta.json")
        _cache["overflow"] = (reg, clf, meta)
    return _cache["overflow"]


def get_dispatcher_model():
    if "dispatcher" not in _cache:
        reg = joblib.load(os.path.join(ARTIFACT_DIR, "dispatcher_regressor.joblib"))
        meta = _load_json("dispatcher_meta.json")
        _cache["dispatcher"] = (reg, meta)
    return _cache["dispatcher"]


def get_typology_model():
    if "typology" not in _cache:
        from tensorflow import keras
        model = keras.models.load_model(os.path.join(ARTIFACT_DIR, "typology_cnn.keras"))
        meta = _load_json("typology_meta.json")
        _cache["typology"] = (model, meta)
    return _cache["typology"]


def get_contamination_model():
    if "contamination" not in _cache:
        from tensorflow import keras
        model = keras.models.load_model(os.path.join(ARTIFACT_DIR, "contamination_cnn.keras"))
        meta = _load_json("contamination_meta.json")
        _cache["contamination"] = (model, meta)
    return _cache["contamination"]


def preload_all():
    """Call at app startup so the first real request isn't slow."""
    get_overflow_models()
    get_dispatcher_model()
    get_typology_model()
    get_contamination_model()
