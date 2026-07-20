"""
Trains and saves every real model this project uses, as loadable
artifacts the FastAPI backend imports for LIVE inference — not
precomputed scenario tables. Run once at setup (or in CI/deploy):

    python3 -m app.ml.train_all

Produces (under app/ml/artifacts/):
  overflow_regressor.joblib, overflow_classifier.joblib, overflow_meta.json
  dispatcher_regressor.joblib, dispatcher_meta.json
  typology_cnn.keras, typology_meta.json
  contamination_cnn.keras, contamination_meta.json
"""
import json
import os
import random

import numpy as np
import pandas as pd
import openpyxl
import joblib

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
XLSX_PATH = os.path.join(DATA_DIR, "wits_dataset.xlsx")

os.makedirs(ARTIFACT_DIR, exist_ok=True)

RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)


def load_wits_rows():
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
    ws = wb["Cleaned Data"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    cols = ["City", "WasteType", "Tons", "RecyclingRate", "PopDensity", "EffScore",
            "Disposal", "Cost", "Campaigns", "Landfill", "LandfillCap", "Year", "Lat", "Lon"]
    return [dict(zip(cols, r)) for r in rows]


# =====================================================================
# 1. Predictive Overflow Engine — RandomForest regressor + classifier
# =====================================================================
def train_overflow_engine():
    from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import mean_absolute_error, r2_score, accuracy_score, f1_score
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.compose import ColumnTransformer
    from sklearn.pipeline import Pipeline

    print("[overflow] loading WITS rows for per-sector baseline volume...")
    rows = load_wits_rows()
    city_avg_tons = {}
    for r in rows:
        city_avg_tons.setdefault(r["City"], []).append(r["Tons"])
    city_avg_tons = {c: float(np.mean(v)) for c, v in city_avg_tons.items()}
    sectors = sorted(city_avg_tons.keys())
    tons_values = np.array(list(city_avg_tons.values()))
    tons_min, tons_max = tons_values.min(), tons_values.max()

    def baseline_hours(city):
        norm = (city_avg_tons[city] - tons_min) / (tons_max - tons_min + 1e-9)
        return 34 - norm * 22

    weather_options = ["Clear", "Normal", "Rain", "Heatwave"]

    def true_hours(city, is_weekend, is_holiday, weather, temp_c, rainfall_mm, event_flag):
        hours = baseline_hours(city)
        if is_weekend: hours *= 0.75
        if is_holiday: hours *= 0.70
        if event_flag: hours *= 0.80
        if weather == "Rain":
            hours *= 0.85
            hours -= min(rainfall_mm, 40) * 0.06
        elif weather == "Heatwave":
            hours *= 0.90
        hours -= max(0, (temp_c - 30)) * 0.15
        hours = max(2.0, hours)
        noise = np.random.normal(0, hours * 0.12)
        return max(1.5, hours + noise)

    print("[overflow] generating training rows...")
    recs = []
    for _ in range(9000):
        city = random.choice(sectors)
        dow = random.randint(0, 6)
        is_weekend = dow in (5, 6)
        is_holiday = random.random() < 0.045
        weather = random.choices(weather_options, weights=[0.35, 0.30, 0.20, 0.15])[0]
        if weather == "Rain":
            temp_c, rainfall_mm = round(random.uniform(20, 28), 1), round(random.uniform(3, 45), 1)
        elif weather == "Heatwave":
            temp_c, rainfall_mm = round(random.uniform(38, 46), 1), 0.0
        elif weather == "Clear":
            temp_c, rainfall_mm = round(random.uniform(25, 34), 1), 0.0
        else:
            temp_c, rainfall_mm = round(random.uniform(22, 32), 1), 0.0
        event_flag = is_weekend and random.random() < 0.35
        hours = true_hours(city, is_weekend, is_holiday, weather, temp_c, rainfall_mm, event_flag)
        recs.append({"sector": city, "day_of_week": dow, "is_weekend": int(is_weekend), "is_holiday": int(is_holiday),
                      "weather": weather, "temp_c": temp_c, "rainfall_mm": rainfall_mm, "event_flag": int(event_flag),
                      "hours_to_overflow": round(hours, 2)})
    df = pd.DataFrame(recs)

    def tier_of(h):
        if h < 8: return "Critical"
        if h < 16: return "High"
        if h < 26: return "Medium"
        return "Low"
    df["risk_tier"] = df["hours_to_overflow"].apply(tier_of)

    num_f = ["day_of_week", "is_weekend", "is_holiday", "temp_c", "rainfall_mm", "event_flag"]
    cat_f = ["sector", "weather"]
    X, y_reg, y_clf = df[num_f + cat_f], df["hours_to_overflow"], df["risk_tier"]
    Xtr, Xte, ytr, yte, yctr, ycte = train_test_split(X, y_reg, y_clf, test_size=0.2, random_state=RANDOM_SEED)

    prep = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), cat_f)], remainder="passthrough")
    reg = Pipeline([("prep", prep), ("model", RandomForestRegressor(n_estimators=100, max_depth=9, random_state=RANDOM_SEED, n_jobs=-1))])
    reg.fit(Xtr, ytr)
    clf = Pipeline([("prep", prep), ("model", RandomForestClassifier(n_estimators=100, max_depth=9, random_state=RANDOM_SEED, n_jobs=-1, class_weight="balanced"))])
    clf.fit(Xtr, yctr)

    mae = mean_absolute_error(yte, reg.predict(Xte))
    r2 = r2_score(yte, reg.predict(Xte))
    acc = accuracy_score(ycte, clf.predict(Xte))
    f1 = f1_score(ycte, clf.predict(Xte), average="macro")
    print(f"[overflow] MAE={mae:.2f} R2={r2:.3f} acc={acc:.3f} f1={f1:.3f}")

    joblib.dump(reg, os.path.join(ARTIFACT_DIR, "overflow_regressor.joblib"))
    joblib.dump(clf, os.path.join(ARTIFACT_DIR, "overflow_classifier.joblib"))
    with open(os.path.join(ARTIFACT_DIR, "overflow_meta.json"), "w") as f:
        json.dump({"sectors": sectors, "weather_options": weather_options,
                    "metrics": {"mae": round(mae, 2), "r2": round(r2, 3), "accuracy": round(acc, 3), "f1": round(f1, 3)}}, f)
    print("[overflow] saved.")


# =====================================================================
# 2. Predictive Dispatcher — RandomForestRegressor on simulated bin history
# =====================================================================
def train_dispatcher():
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import mean_absolute_error, r2_score
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.compose import ColumnTransformer
    from sklearn.pipeline import Pipeline

    print("[dispatcher] simulating 1 year of bin history...")
    bin_types = ["General", "Recycling", "Organic"]
    base_rate = {"General": 14, "Recycling": 8, "Organic": 22}
    capacities = {"General": 1100, "Recycling": 660, "Organic": 240}

    weather_options = ["Clear", "Normal", "Rain", "Heatwave"]
    n_days = 365
    dates = pd.date_range("2024-01-01", periods=n_days, freq="D")
    holiday_days = set(np.random.choice(n_days, size=16, replace=False))
    ctx = []
    for d in range(n_days):
        dow = dates[d].dayofweek
        is_weekend = dow in (5, 6)
        is_holiday = d in holiday_days
        weather = random.choices(weather_options, weights=[0.35, 0.30, 0.20, 0.15])[0]
        temp_c = {"Clear": np.random.uniform(25, 34), "Normal": np.random.uniform(22, 32),
                  "Rain": np.random.uniform(20, 28), "Heatwave": np.random.uniform(38, 46)}[weather]
        rainfall_mm = np.random.uniform(3, 45) if weather == "Rain" else 0.0
        event_flag = is_weekend and random.random() < 0.3
        ctx.append({"day_idx": d, "day_of_week": dow, "is_weekend": int(is_weekend), "is_holiday": int(is_holiday),
                    "weather": weather, "temp_c": round(temp_c, 1), "rainfall_mm": round(rainfall_mm, 1), "event_flag": int(event_flag)})
    ctx_df = pd.DataFrame(ctx)

    def accum(base, row):
        rate = base
        if row.is_weekend: rate *= 1.35
        if row.is_holiday: rate *= 1.5
        if row.event_flag: rate *= 1.25
        if row.weather == "Rain": rate *= 0.8
        elif row.weather == "Heatwave": rate *= 1.15
        return max(0, rate * np.random.uniform(0.85, 1.15))

    records = []
    n_bins = 60
    for i in range(n_bins):
        btype = random.choices(bin_types, weights=[0.5, 0.3, 0.2])[0]
        density = np.random.uniform(0.7, 1.5)
        fill = np.random.uniform(0, 40)
        bin_id = f"BIN-{i:03d}"
        for _, row in ctx_df.iterrows():
            fill += accum(base_rate[btype] * density, row)
            collected = 0
            if fill >= 100 or (fill >= 78 and random.random() < 0.08):
                fill = np.random.uniform(2, 8)
                collected = 1
            records.append({"bin_id": bin_id, "bin_type": btype, "capacity_l": capacities[btype], "day_idx": row.day_idx, "fill_pct": round(min(fill, 100), 2), "collected": collected})
    hist = pd.DataFrame(records).merge(ctx_df, on="day_idx")
    hist = hist.sort_values(["bin_id", "day_idx"]).reset_index(drop=True)

    hist["next_fill_pct"] = hist.groupby("bin_id")["fill_pct"].shift(-1)
    for col in ["day_of_week", "is_weekend", "is_holiday", "weather", "temp_c", "rainfall_mm", "event_flag"]:
        hist[f"next_{col}"] = hist.groupby("bin_id")[col].shift(-1)
    hist = hist.dropna(subset=["next_fill_pct"])
    hist = hist[hist["collected"] == 0]  # exclude the reset discontinuity itself from training signal

    num_f = ["fill_pct", "next_day_of_week", "next_is_weekend", "next_is_holiday", "next_temp_c", "next_rainfall_mm", "next_event_flag", "capacity_l"]
    cat_f = ["bin_type", "next_weather"]
    X, y = hist[num_f + cat_f], hist["next_fill_pct"]
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=RANDOM_SEED)

    prep = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), cat_f)], remainder="passthrough")
    reg = Pipeline([("prep", prep), ("model", RandomForestRegressor(n_estimators=100, max_depth=10, random_state=RANDOM_SEED, n_jobs=-1))])
    reg.fit(Xtr, ytr)
    mae = mean_absolute_error(yte, reg.predict(Xte))
    r2 = r2_score(yte, reg.predict(Xte))
    print(f"[dispatcher] MAE={mae:.2f} R2={r2:.3f}")

    joblib.dump(reg, os.path.join(ARTIFACT_DIR, "dispatcher_regressor.joblib"))
    with open(os.path.join(ARTIFACT_DIR, "dispatcher_meta.json"), "w") as f:
        json.dump({"bin_types": bin_types, "capacities": capacities, "weather_options": weather_options,
                    "metrics": {"mae": round(mae, 2), "r2": round(r2, 3)}}, f)
    print("[dispatcher] saved.")


# =====================================================================
# 3 & 4. Vision models (Typology + Contamination) — real Keras CNNs
# =====================================================================
def train_vision_models():
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    from PIL import Image, ImageDraw, ImageFilter

    tf.random.set_seed(RANDOM_SEED)
    IMG_SIZE = 80
    MATERIALS = ["Plastic", "Organic", "Metal", "Cardboard", "Mixed"]
    PALETTES = {
        "Plastic": [(230, 70, 90), (60, 130, 230), (240, 200, 40), (40, 200, 160)],
        "Organic": [(90, 60, 30), (60, 90, 30), (110, 80, 40), (70, 100, 40)],
        "Metal": [(150, 150, 158), (180, 180, 188), (120, 120, 128), (200, 200, 208)],
        "Cardboard": [(178, 140, 90), (196, 160, 110), (160, 125, 78), (210, 190, 160)],
        "Paper": [(178, 140, 90), (196, 160, 110), (160, 125, 78), (210, 190, 160)],
        "Mixed": [(120, 110, 100), (100, 130, 110), (140, 100, 90), (110, 120, 140)],
        "Glass": [(170, 225, 205), (140, 210, 220), (120, 195, 175), (190, 230, 225)],
    }

    def draw_blob(draw, cx, cy, r, color, jitter=0.4):
        pts = []
        for i in range(10):
            ang = 2 * np.pi * i / 10
            rr = r * (1 + random.uniform(-jitter, jitter))
            pts.append((cx + rr * np.cos(ang), cy + rr * np.sin(ang)))
        draw.polygon(pts, fill=color)

    def gen_image(fill_fraction, material_mix):
        img = Image.new("RGB", (IMG_SIZE, IMG_SIZE), (58, 58, 62))
        draw = ImageDraw.Draw(img)
        wall = 5
        draw.rectangle([0, 0, IMG_SIZE, wall], fill=(35, 35, 38))
        draw.rectangle([0, 0, wall, IMG_SIZE], fill=(35, 35, 38))
        draw.rectangle([IMG_SIZE - wall, 0, IMG_SIZE, IMG_SIZE], fill=(35, 35, 38))
        draw.rectangle([0, IMG_SIZE - wall, IMG_SIZE, IMG_SIZE], fill=(35, 35, 38))
        interior = IMG_SIZE - 2 * wall
        n_blobs = int(60 * fill_fraction) + 5
        materials, weights = list(material_mix.keys()), list(material_mix.values())
        for _ in range(n_blobs):
            mat = random.choices(materials, weights=weights)[0]
            color = random.choice(PALETTES[mat])
            color = tuple(max(0, min(255, c + random.randint(-15, 15))) for c in color)
            cx = wall + random.uniform(0.1, 0.9) * interior
            cy = wall + random.uniform(0.1, 0.9) * interior
            r = random.uniform(3, 8)
            draw_blob(draw, cx, cy, r, color)
        img = img.filter(ImageFilter.GaussianBlur(0.4))
        arr = np.clip(np.array(img).astype(np.int16) + np.random.randint(-6, 6, np.array(img).shape), 0, 255).astype(np.uint8)
        return Image.fromarray(arr)

    # ---- Typology CNN ----
    print("[typology] generating data + training...")
    def sample_mix():
        n = random.choice([1, 1, 2, 2, 3])
        chosen = random.sample(MATERIALS[:-1], k=min(n, 4))
        raw = np.random.dirichlet(np.ones(len(chosen)) * 1.5)
        mix = {m: float(f) for m, f in zip(chosen, raw)}
        dominant = max(mix, key=mix.get)
        if mix[dominant] < 0.45: dominant = "Mixed"
        return mix, dominant

    N = 2600
    Ximg = np.zeros((N, IMG_SIZE, IMG_SIZE, 3), dtype=np.float32)
    yfill = np.zeros(N, dtype=np.float32)
    ymat = np.zeros(N, dtype=np.int32)
    for i in range(N):
        fill = float(np.clip(np.random.beta(2, 1.5), 0.05, 0.98))
        mix, dominant = sample_mix()
        Ximg[i] = np.array(gen_image(fill, mix)).astype(np.float32) / 255.0
        yfill[i] = fill
        ymat[i] = MATERIALS.index(dominant)

    split = int(N * 0.85)
    inputs = keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
    x = layers.Conv2D(16, 3, activation="relu", padding="same")(inputs)
    x = layers.MaxPooling2D()(x)
    x = layers.Conv2D(32, 3, activation="relu", padding="same")(x)
    x = layers.MaxPooling2D()(x)
    x = layers.Conv2D(64, 3, activation="relu", padding="same")(x)
    x = layers.MaxPooling2D()(x)
    x = layers.Flatten()(x)
    x = layers.Dense(64, activation="relu")(x)
    x = layers.Dropout(0.3)(x)
    fill_out = layers.Dense(1, activation="sigmoid", name="fill")(x)
    mat_out = layers.Dense(len(MATERIALS), activation="softmax", name="material")(x)
    model = keras.Model(inputs, [fill_out, mat_out])
    model.compile(optimizer="adam", loss={"fill": "mse", "material": "sparse_categorical_crossentropy"},
                  loss_weights={"fill": 1.0, "material": 0.5}, metrics={"fill": "mae", "material": "accuracy"})
    model.fit(Ximg[:split], {"fill": yfill[:split], "material": ymat[:split]}, epochs=10, batch_size=64, verbose=2, validation_split=0.15)
    res = model.evaluate(Ximg[split:], {"fill": yfill[split:], "material": ymat[split:]}, verbose=0, return_dict=True)
    print(f"[typology] fill_mae={res['fill_mae']:.4f} material_acc={res['material_accuracy']:.4f}")

    model.save(os.path.join(ARTIFACT_DIR, "typology_cnn.keras"))
    with open(os.path.join(ARTIFACT_DIR, "typology_meta.json"), "w") as f:
        json.dump({"materials": MATERIALS, "img_size": IMG_SIZE,
                    "metrics": {"fill_mae": round(float(res["fill_mae"]), 4), "material_accuracy": round(float(res["material_accuracy"]), 4)},
                    "density_kg_m3": {"Plastic": 60, "Organic": 350, "Metal": 250, "Cardboard": 55, "Mixed": 150},
                    "emission_kgco2e_per_kg": {"Plastic": 0.03, "Organic": 0.50, "Metal": 0.02, "Cardboard": 0.40, "Mixed": 0.25},
                    "dumpster_volume_m3": 4.5}, f)
    print("[typology] saved.")

    # ---- Contamination CNN (multi-input) ----
    print("[contamination] generating data + training...")
    BIN_TYPES = ["Paper", "Plastic", "Metal", "Glass"]
    ALL_MATERIALS = ["Paper", "Plastic", "Metal", "Glass", "Organic"]
    CONTAM_CLASSES = ["None"] + ALL_MATERIALS

    def sample_contam():
        bin_type = random.choice(BIN_TYPES)
        is_clean = random.random() < 0.32
        if is_clean:
            return bin_type, {bin_type: 1.0}, 0.0, "None"
        pool = [m for m in ALL_MATERIALS if m != bin_type]
        chosen = random.sample(pool, k=random.choice([1, 1, 2]))
        contam_total = np.random.uniform(0.15, 0.65)
        raw = np.random.dirichlet(np.ones(len(chosen)))
        fractions = {bin_type: 1 - contam_total}
        for m, f in zip(chosen, raw): fractions[m] = f * contam_total
        dominant = max(chosen, key=lambda m: fractions[m])
        return bin_type, fractions, contam_total * 100, dominant

    N2 = 2600
    Ximg2 = np.zeros((N2, IMG_SIZE, IMG_SIZE, 3), dtype=np.float32)
    Xbin2 = np.zeros((N2, len(BIN_TYPES)), dtype=np.float32)
    ypct2 = np.zeros(N2, dtype=np.float32)
    ycls2 = np.zeros(N2, dtype=np.int32)
    for i in range(N2):
        bt, fractions, pct, dom = sample_contam()
        Ximg2[i] = np.array(gen_image(1.0, fractions)).astype(np.float32) / 255.0
        Xbin2[i, BIN_TYPES.index(bt)] = 1.0
        ypct2[i] = pct
        ycls2[i] = CONTAM_CLASSES.index(dom)

    split2 = int(N2 * 0.85)
    img_in = keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3), name="image")
    xc = layers.Conv2D(16, 3, activation="relu", padding="same")(img_in)
    xc = layers.MaxPooling2D()(xc)
    xc = layers.Conv2D(32, 3, activation="relu", padding="same")(xc)
    xc = layers.MaxPooling2D()(xc)
    xc = layers.Conv2D(64, 3, activation="relu", padding="same")(xc)
    xc = layers.MaxPooling2D()(xc)
    xc = layers.Flatten()(xc)
    bin_in = keras.Input(shape=(len(BIN_TYPES),), name="bin_type")
    b = layers.Dense(16, activation="relu")(bin_in)
    merged = layers.concatenate([xc, b])
    merged = layers.Dense(80, activation="relu")(merged)
    merged = layers.Dropout(0.3)(merged)
    contam_out = layers.Dense(1, activation="sigmoid", name="contam_pct")(merged)
    class_out = layers.Dense(len(CONTAM_CLASSES), activation="softmax", name="contaminant_class")(merged)
    cmodel = keras.Model([img_in, bin_in], [contam_out, class_out])
    cmodel.compile(optimizer="adam", loss={"contam_pct": "mse", "contaminant_class": "sparse_categorical_crossentropy"},
                    loss_weights={"contam_pct": 1.0, "contaminant_class": 0.6},
                    metrics={"contam_pct": "mae", "contaminant_class": "accuracy"})
    cmodel.fit({"image": Ximg2[:split2], "bin_type": Xbin2[:split2]},
                {"contam_pct": ypct2[:split2] / 100.0, "contaminant_class": ycls2[:split2]},
                epochs=10, batch_size=64, verbose=2, validation_split=0.15)
    res2 = cmodel.evaluate({"image": Ximg2[split2:], "bin_type": Xbin2[split2:]},
                             {"contam_pct": ypct2[split2:] / 100.0, "contaminant_class": ycls2[split2:]}, verbose=0, return_dict=True)
    pred_pct, _ = cmodel.predict({"image": Ximg2[split2:], "bin_type": Xbin2[split2:]}, verbose=0)
    alert_acc = float(np.mean((pred_pct.flatten() * 100 > 15) == (ypct2[split2:] > 15)))
    print(f"[contamination] pct_mae={res2['contam_pct_mae']:.4f} class_acc={res2['contaminant_class_accuracy']:.4f} alert_acc={alert_acc:.3f}")

    cmodel.save(os.path.join(ARTIFACT_DIR, "contamination_cnn.keras"))
    with open(os.path.join(ARTIFACT_DIR, "contamination_meta.json"), "w") as f:
        json.dump({"bin_types": BIN_TYPES, "contaminant_classes": CONTAM_CLASSES, "img_size": IMG_SIZE, "alert_threshold_pct": 15.0,
                    "metrics": {"pct_mae": round(float(res2["contam_pct_mae"]) * 100, 2),
                                "class_accuracy": round(float(res2["contaminant_class_accuracy"]), 4),
                                "alert_accuracy": round(alert_acc, 3)}}, f)
    print("[contamination] saved.")


if __name__ == "__main__":
    train_overflow_engine()
    train_dispatcher()
    train_vision_models()
    print("\nAll models trained and saved to", ARTIFACT_DIR)
