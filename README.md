# DiaRisk VN

DiaRisk VN là ứng dụng web hỗ trợ quy trình ước tính xác suất tự khai đã được chẩn đoán tiểu đường, gồm giao diện React, API Node.js, dịch vụ mô hình Python và MongoDB.

> **Giới hạn y tế:** Các model sử dụng dữ liệu BRFSS tự khai báo và dự đoán nhãn “đã được chẩn đoán tiểu đường”, không phải nguy cơ mắc bệnh trong tương lai. Chúng chưa được thẩm định lâm sàng tại Việt Nam, không dùng để chẩn đoán/điều trị và không thay thế tư vấn của nhân viên y tế. Các yếu tố SHAP mô tả đóng góp vào điểm đầu ra của mô hình, không phải phần trăm thay đổi xác suất.

## Thành phần

| Thành phần | Công nghệ | Nhiệm vụ |
|---|---|---|
| `frontend/` | React 18, TypeScript, Vite, Tailwind CSS | Đăng nhập, hồ sơ, dự đoán, lịch sử và màn hình quản trị/bác sĩ |
| `backend/` | Node.js, Express 4, TypeScript, MongoDB driver | Xác thực/phân quyền, lưu dữ liệu, batch Excel, báo cáo, nhật ký |
| `ml-service/` | Python, FastAPI, scikit-learn, XGBoost | Kiểm tra đầu vào và phục vụ model phi lâm sàng/lâm sàng |
| `docs/` | Markdown | Lược đồ MongoDB |

Hai bundle `ml-service/model/*_bundle.joblib` và schema JSON tương ứng là tài sản cần thiết để chạy model. Dữ liệu huấn luyện `brfss2015_clean.csv` không cần để chạy dịch vụ và được loại khỏi Docker context.

## Mô hình và dữ liệu đầu vào

- **Phi lâm sàng:** tuổi, giới tính, BMI, tình trạng hút thuốc, hoạt động và tiền sử sức khỏe/tập quán.
- **Lâm sàng:** các trường phi lâm sàng cùng một số chẩn đoán/tiền sử tự khai như huyết áp cao, cholesterol, bệnh tim, đột quỵ, bệnh thận và lần khám gần nhất. Model này **không** nhận glucose, insulin hoặc chỉ số xét nghiệm Pima.
- Nhập tuổi theo năm; API tự quy đổi sang nhóm tuổi model sử dụng. `sex` nhận `Male`/`Female`; trường nhị phân khác nhận `0`/`1`; `smoker_status` nhận `current`, `former`, `never`.
- Cả hai model yêu cầu `age`, `sex`, `bmi`; tối đa 3 trường được bỏ trống ở chế độ phi lâm sàng và 2 ở chế độ lâm sàng.
- Ngưỡng phân loại lấy từ bundle. Các số liệu test được lưu trong `ml-service/model/evaluation.json` (AUC khoảng 0,825 và 0,849; precision khoảng 0,285 và 0,315). Đây là đánh giá nội bộ trên cohort BRFSS, không chứng minh hiệu quả lâm sàng hoặc khả năng áp dụng tại Việt Nam.

## Yêu cầu

- Node.js 18+ và npm
- Python 3.11+ (khuyến nghị Python 3.12; phiên bản thư viện ML được ghim theo model artifact)
- MongoDB 6+ đang chạy hoặc MongoDB URI truy cập được
- Docker tùy chọn nếu muốn chạy ML service dưới dạng container

## Cài đặt

Ở thư mục gốc, cài dependency dùng để chạy đồng thời các service trên Linux/WSL:

```bash
npm ci
```

### Backend

```bash
cd backend
npm ci
```

Tạo file môi trường:

```bash
cp .env.example .env
```

Đặt các khóa bí mật riêng trước khi chạy. `JWT_SECRET` phải dài tối thiểu 32 ký tự; `DATA_ENCRYPTION_KEY` là khóa 32 byte mã hóa dạng hex 64 ký tự hoặc base64. Có thể tạo khóa hex ngẫu nhiên bằng:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Không dùng chung một khóa cho hai biến và không commit `.env`. Các biến được hỗ trợ:

| Biến | Giá trị mặc định | Mô tả |
|---|---|---|
| `PORT` | `5000` | Cổng backend |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | URI MongoDB |
| `MONGODB_DATABASE` | `diarisk_vn` | Tên database |
| `JWT_SECRET` | Không có | Khóa ký JWT riêng tư |
| `JWT_EXPIRES_IN` | `30m` | Thời hạn JWT |
| `ML_SERVICE_URL` | `http://127.0.0.1:8000` | URL FastAPI |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Origin frontend được phép |
| `UPLOAD_DIR` | `uploads` | Thư mục upload tạm |
| `DATA_ENCRYPTION_KEY` | Không có | Khóa AES-256-GCM dạng hex/base64 |

### Frontend

```bash
cd frontend
npm ci
```

### ML service

```bash
cd ml-service
```

Tạo môi trường ảo bằng Python 3.12:

```bash
# Windows PowerShell
py -3.12 -m venv .venv

# Linux / macOS / WSL
python3.12 -m venv .venv
```

Kích hoạt môi trường ảo rồi cài dependencies:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

```bash
# Linux / macOS / WSL
source .venv/bin/activate
pip install -r requirements.txt
```

Model bundle được kiểm tra phiên bản `numpy`, `pandas` và `scikit-learn` khi khởi động. Nếu thiếu artifact hoặc phiên bản không khớp, service sẽ dừng với lỗi thay vì trả kết quả demo.

## Chạy ứng dụng

Khởi động MongoDB, sau đó chạy mỗi dịch vụ trong một terminal:

```bash
# backend/
npm run dev
```

```bash
# ml-service/ — sau khi kích hoạt .venv
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

```bash
# frontend/
npm run dev
```

Mở `http://localhost:5173`. Trong Linux/WSL, sau khi cài dependencies và tạo `ml-service/.venv`, lệnh `npm run dev` ở thư mục gốc khởi động đồng thời cả ba service.

### Chạy ML service bằng Docker

Từ thư mục gốc:

```bash
docker build -t diarisk-ml ./ml-service
docker run --rm -p 8000:8000 diarisk-ml
```

Docker image chứa hai model bundle và schema cần thiết, không chứa CSV huấn luyện.

## Kiểm tra và API

- Frontend: `http://localhost:5173`
- Backend health: `GET http://localhost:5000/api/health`
- ML health: `GET http://localhost:8000/health`
- FastAPI docs: `http://localhost:8000/docs`

Backend API có tiền tố `/api`; endpoint được bảo vệ dùng header `Authorization: Bearer <JWT>`.

| Method | Endpoint | Chức năng |
|---|---|---|
| `POST` | `/auth/register`, `/auth/login`, `/auth/logout` | Tài khoản và phiên đăng nhập |
| `GET` | `/auth/me`, `/users/me` | Lấy thông tin phiên/hồ sơ |
| `PATCH` | `/users/me` | Cập nhật hồ sơ |
| `POST` | `/users/me/password` | Đổi mật khẩu |
| `POST` | `/predictions` | Dự đoán cá nhân hoặc cho bệnh nhân |
| `GET` | `/predictions` | Lịch sử dự đoán |
| `GET`, `DELETE` | `/predictions/:id` | Chi tiết/xóa mềm dự đoán |
| `GET`, `POST` | `/patients` | Danh sách/tạo hồ sơ bệnh nhân |
| `GET` | `/patients/:id/predictions` | Lịch sử của bệnh nhân |
| `POST` | `/batches/validate`, `/batches/:id/confirm` | Kiểm tra Excel và chạy batch |
| `GET` | `/batches`, `/templates/active/download` | Danh sách batch/tải mẫu |
| `POST` | `/reports/export` | Xuất báo cáo XLSX hoặc PDF |
| `/admin/*` | Tài khoản, mẫu Excel, nhật ký hệ thống | Chỉ admin |

Batch hiện nhận `.xlsx` tối đa 10 MB và 1.000 dòng; batch dự đoán dùng schema phi lâm sàng. Dòng lỗi được trả kèm số dòng/cột để người dùng sửa.

## Bảo mật và vận hành

- Mật khẩu được băm; JWT được ràng buộc với phiên lưu trong MongoDB.
- Dữ liệu bệnh nhân và input/SHAP/advice của dự đoán được mã hóa AES-256-GCM trước khi lưu. Bảo vệ và backup riêng cả MongoDB lẫn các khóa bí mật.
- Không có tài khoản admin mặc định. Tạo/cấp quyền admin bằng quy trình quản trị đáng tin cậy; không để lộ thông tin đăng nhập mặc định.
- Tài liệu yêu cầu backup hằng ngày lúc 02:00 và RTO 2 giờ; lịch backup/khôi phục và RTO chưa được tự động cấu hình hoặc kiểm thử trong phiên bản này.
- Chưa có kiểm thử tải để chứng minh yêu cầu 200 người dùng đồng thời, thời gian phản hồi dưới 2,5 giây hoặc 50 dòng/giây. Không triển khai dữ liệu thật trước khi hoàn thành kiểm thử, đánh giá bảo mật, quy trình lưu giữ/xóa dữ liệu và thẩm định chuyên môn/pháp lý.

Schema MongoDB: [`docs/MONGODB_SCHEMA.md`](docs/MONGODB_SCHEMA.md).
