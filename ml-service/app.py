import json
import os
from pathlib import Path
from typing import Any, Literal

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

MODEL_DIR = Path(os.getenv("MODEL_DIR", Path(__file__).resolve().parent / "model"))
DISCLAIMER = (
    "Mô hình ước tính xác suất tự khai đã được chẩn đoán tiểu đường trong dữ liệu BRFSS; "
    "chưa được kiểm định lâm sàng tại Việt Nam. Kết quả không phải chẩn đoán và không thay thế "
    "tư vấn của nhân viên y tế."
)
ADVICE = [
    "Trao đổi với nhân viên y tế để được đánh giá và tư vấn phù hợp.",
    "Không tự ý thay đổi thuốc hoặc phương pháp điều trị dựa trên kết quả này.",
]


def load_model(mode: str) -> dict[str, Any]:
    bundle_path = MODEL_DIR / f"{mode}_bundle.joblib"
    schema_path = MODEL_DIR / f"{mode}_schema.json"
    if not bundle_path.is_file() or not schema_path.is_file():
        raise RuntimeError(f"Missing {mode} model bundle or schema in {MODEL_DIR}.")

    bundle = joblib.load(bundle_path)
    with schema_path.open(encoding="utf-8") as schema_file:
        schema = json.load(schema_file)
    if bundle.get("mode") != mode or bundle.get("schema") != schema:
        raise RuntimeError(f"The {mode} model bundle does not match its schema.")

    expected_versions = bundle.get("library_versions", {})
    runtime_versions = {
        "numpy": np.__version__,
        "pandas": pd.__version__,
        "sklearn": sklearn.__version__,
    }
    incompatible = {
        name: {"expected": expected, "installed": runtime_versions.get(name)}
        for name, expected in expected_versions.items()
        if runtime_versions.get(name) != expected
    }
    if incompatible:
        raise RuntimeError(f"Incompatible {mode} model runtime versions: {incompatible}.")
    return bundle


MODELS = {
    "nonclinical": load_model("nonclinical"),
    "clinical": load_model("clinical"),
}

app = FastAPI(
    title="DiaRisk VN ML Service",
    version="1.0.0",
    description="BRFSS-based risk estimation models; not clinically validated.",
)


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    features: dict[str, Any] = Field(min_length=1)
    mode: Literal["nonclinical", "clinical"] = "nonclinical"


def numeric_value(name: str, value: Any) -> float:
    if isinstance(value, bool):
        raise HTTPException(status_code=422, detail=f"{name} must be a number.")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail=f"{name} must be a number.") from None
    if not np.isfinite(number):
        raise HTTPException(status_code=422, detail=f"{name} must be finite.")
    return number


def age_group(age: float) -> int:
    if age <= 24:
        return 1
    if age >= 80:
        return 13
    return min(12, 2 + int((age - 25) // 5))


def validate_and_prepare(mode: str, features: dict[str, Any]) -> tuple[dict[str, Any], pd.DataFrame]:
    bundle = MODELS[mode]
    schema = bundle["schema"]
    allowed = set(schema["api_fields"])
    unknown = set(features) - allowed
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unsupported feature(s): {', '.join(sorted(unknown))}.")

    normalized: dict[str, Any] = {}
    for name, value in features.items():
        if value is None or value == "":
            continue
        if name == "sex":
            if value not in schema["sex_values"]:
                raise HTTPException(status_code=422, detail="sex must be Male or Female.")
            normalized[name] = value
            continue
        if name == "smoker_status":
            if not isinstance(value, str) or value not in schema["smoker_values"]:
                raise HTTPException(status_code=422, detail="smoker_status must be current, former, or never.")
            normalized[name] = value
            continue

        number = numeric_value(name, value)
        if name == "age":
            age_min, age_max = schema["age_range"]
            if not number.is_integer() or not age_min <= number <= age_max:
                raise HTTPException(status_code=422, detail=f"age must be an integer from {age_min} to {age_max}.")
        elif name == "bmi":
            bmi_min, bmi_max = schema["bmi_range"]
            if not bmi_min <= number <= bmi_max:
                raise HTTPException(status_code=422, detail=f"bmi must be from {bmi_min} to {bmi_max}.")
        elif name in schema["binary_fields"]:
            if number not in (0, 1):
                raise HTTPException(status_code=422, detail=f"{name} must be 0 or 1.")
        elif name in schema["integer_ranges"]:
            minimum, maximum = schema["integer_ranges"][name]
            if not number.is_integer() or not minimum <= number <= maximum:
                raise HTTPException(status_code=422, detail=f"{name} must be an integer from {minimum} to {maximum}.")
        else:
            raise HTTPException(status_code=422, detail=f"Unsupported feature: {name}.")
        normalized[name] = int(number) if number.is_integer() else number

    missing_required = set(schema["always_required"]) - set(normalized)
    if missing_required:
        raise HTTPException(
            status_code=422,
            detail=f"Required feature(s) missing: {', '.join(sorted(missing_required))}.",
        )
    missing_count = len(allowed - set(normalized))
    max_missing = schema["missing_policy"][mode]
    if missing_count > max_missing:
        raise HTTPException(
            status_code=422,
            detail=f"At most {max_missing} feature(s) may be omitted; received {missing_count} missing feature(s).",
        )

    model_row: dict[str, Any] = {}
    for name in bundle["features"]:
        if name == "age_group":
            model_row[name] = age_group(normalized["age"])
        elif name == "sex":
            model_row[name] = 0 if normalized["sex"] == "Male" else 1
        else:
            model_row[name] = normalized.get(name, np.nan)
    return normalized, pd.DataFrame([model_row], columns=bundle["features"])


def predict_with_bundle(mode: str, source: dict[str, Any], row: pd.DataFrame) -> dict[str, Any]:
    bundle = MODELS[mode]
    transformed = bundle["preprocessor"].transform(row)
    feature_names = list(bundle["model"].feature_names_in_)
    matrix = xgb.DMatrix(transformed, feature_names=feature_names)
    booster = bundle["model"].get_booster()
    raw_probability = float(booster.predict(matrix)[0])
    probability = float(bundle["calibrator"].predict_proba(np.array([[raw_probability]]))[0, 1])
    if not np.isfinite(probability) or not 0 <= probability <= 1:
        raise RuntimeError("The model returned an invalid probability.")

    contributions = booster.predict(matrix, pred_contribs=True)[0, :-1]
    grouped: dict[str, float] = {}
    for name, contribution in zip(feature_names, contributions):
        original_name = next(
            (feature for feature in bundle["features"] if name == feature or name.startswith(f"{feature}_")),
            name,
        )
        grouped[original_name] = grouped.get(original_name, 0.0) + float(contribution)

    shap_values = []
    for name, contribution in sorted(grouped.items(), key=lambda item: abs(item[1]), reverse=True)[:8]:
        value = source.get(name, source.get("age") if name == "age_group" else None)
        shap_values.append({
            "feature": name,
            **({"value": value} if value is not None else {}),
            "shap": contribution,
        })
    threshold = float(bundle["threshold"])
    return {
        "risk_level": "High" if probability >= threshold else "Low",
        "probability": round(probability, 6),
        "shap_values": shap_values,
        "advice": ADVICE,
        "model_version": bundle["version"],
        "warning": DISCLAIMER,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model_status": "loaded",
        "nonclinical_model_version": str(MODELS["nonclinical"]["version"]),
        "clinical_model_version": str(MODELS["clinical"]["version"]),
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, Any]:
    source, row = validate_and_prepare(request.mode, request.features)
    return predict_with_bundle(request.mode, source, row)
