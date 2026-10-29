from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import joblib
import pandas as pd
import numpy as np
from pathlib import Path

app = FastAPI(
    title="DiaRisk VN ML Service", 
    version="1.0.0", 
    description="Hệ thống hỗ trợ phân tích và dự đoán nguy cơ đái tháo đường (BRFSS 2015)"
)

# Thư mục chứa model nằm cùng cấp với app.py
MODEL_DIR = Path("model")
bundles = {}

# Load tự động 2 mô hình (nonclinical và clinical) khi khởi động service
for mode in ["nonclinical", "clinical"]:
    bundle_path = MODEL_DIR / f"{mode}_bundle.joblib"
    if bundle_path.exists():
        bundles[mode] = joblib.load(bundle_path)

# Miền giá trị hợp lệ cho các biến số/thang đo
RANGES = {
    "gen_health": (1, 5), "education": (1, 6), "income": (1, 8),
    "ment_hlth_days": (0, 30), "phys_hlth_days": (0, 30), "last_checkup": (1, 5)
}

def is_missing(value):
    return value is None or (isinstance(value, str) and not value.strip()) or bool(pd.isna(value))

def normalize_record(payload: dict, mode: str):
    if mode not in bundles:
        raise ValueError(f"Mode '{mode}' không hợp lệ hoặc chưa được load.")
    
    features = bundles[mode]["features"]
    row = {c: np.nan for c in features}
    
    # Xử lý tuổi (age) -> chuyển thành age_group theo chuẩn BRFSS
    age = payload.get("age")
    if is_missing(age):
        raise ValueError("Thiếu trường bắt buộc: age")
    try:
        age_val = float(age)
    except ValueError:
        raise ValueError("age phải là số")
    
    if not (18 <= age_val <= 120):
        raise ValueError("age phải nằm trong khoảng từ 18 đến 120")
    
    row["age_group"] = int(np.searchsorted([25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80], age_val, side="right") + 1)
    
    # Xử lý giới tính (sex)
    sex = str(payload.get("sex", "")).strip().lower()
    if sex not in ("male", "female"):
        raise ValueError("sex chỉ nhận giá trị 'Male' hoặc 'Female'")
    row["sex"] = int(sex == "male")
    
    # Xử lý BMI
    bmi = payload.get("bmi")
    if is_missing(bmi):
        raise ValueError("Thiếu trường bắt buộc: bmi")
    try:
        bmi_val = float(bmi)
    except ValueError:
        raise ValueError("bmi phải là số")
    if not (10 <= bmi_val <= 100):
        raise ValueError("bmi phải nằm trong khoảng từ 10 đến 100")
    row["bmi"] = bmi_val
    
    # Xử lý các trường còn lại
    for c in features:
        if c in ("age_group", "sex", "bmi"):
            continue
        v = payload.get(c)
        if is_missing(v):
            continue
        if c == "smoker_status":
            v = str(v).strip().lower()
            if v not in ("current", "former", "never"):
                raise ValueError("smoker_status phải là 'current', 'former' hoặc 'never'")
            row[c] = v
        else:
            try:
                row[c] = float(v)
            except ValueError:
                raise ValueError(f"Trường {c} phải có giá trị dạng số")
                
    # Quy tắc logic đặc thù cho mô hình lâm sàng (clinical)
    if mode == "clinical":
        if row.get("high_bp") == 0 and pd.isna(row.get("bp_meds")):
            row["bp_meds"] = 0
        if row.get("high_bp") == 0 and row.get("bp_meds") == 1:
            raise ValueError("high_bp = 0 mâu thuẫn với bp_meds = 1")
            
    frame = pd.DataFrame([row], columns=features)
    return frame

def logit_feature(p):
    p = np.clip(np.asarray(p), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p)).reshape(-1, 1)

def probabilities(bundle, frame):
    xt = bundle["preprocessor"].transform(frame[bundle["features"]])
    raw = bundle["model"].predict_proba(xt)[:, 1]
    return bundle["calibrator"].predict_proba(logit_feature(raw))[:, 1]

# Cấu trúc dữ liệu đầu vào cho API Request
class PredictionRequest(BaseModel):
    mode: str = Field("nonclinical", description="Chọn 'nonclinical' hoặc 'clinical'")
    data: dict = Field(..., description="Dictionary chứa các chỉ số sức khỏe của bệnh nhân")

@app.get("/health")
def health():
    return {
        "status": "ok", 
        "model_status": "loaded", 
        "available_modes": list(bundles.keys())
    }

@app.post("/predict")
def predict(req: PredictionRequest):
    mode = req.mode
    if mode not in bundles:
        raise HTTPException(
            status_code=400, 
            detail=f"Mode '{mode}' chưa được load hoặc không tồn tại. Các mode khả dụng: {list(bundles.keys())}"
        )
    
    bundle = bundles[mode]
    
    try:
        frame = normalize_record(req.data, mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý dữ liệu: {str(e)}")
    
    # Tính xác suất dự đoán qua pipeline đã train & calibrate
    prob = float(probabilities(bundle, frame)[0])
    threshold = float(bundle["threshold"])
    screen_positive = bool(prob >= threshold)
    
    # Phân loại mức độ nguy cơ
    level = "High" if screen_positive else "Low"
    
    return {
        "mode": mode,
        "risk_level": level,
        "probability": round(prob * 100, 2),
        "probability_raw": prob,
        "screen_positive": screen_positive,
        "threshold": threshold,
        "model_version": bundle["version"],
        "warning": "Kết quả từ mô hình dự đoán học máy dựa trên dữ liệu khảo sát BRFSS 2015, mang tính tham khảo hỗ trợ sàng lọc."
    }