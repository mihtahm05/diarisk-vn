# MongoDB collections / schema conventions

Tất cả tài liệu dùng `_id: ObjectId`, ngày giờ UTC dạng BSON Date và trường `deletedAt: Date|null` cho soft-delete khi phù hợp. ID tham chiếu được lưu dưới dạng ObjectId, không phải chuỗi. Các payload được mã hóa lưu trong `encryptedData`/`encryptedRows` theo định dạng AES-256-GCM (`iv`, `authTag`, `ciphertext`).

- `users`: `{name,email(unique, lowercase),phoneNumber(unique sparse),passwordHash,birthdate,gender,address,avatar,role:user|doctor|admin,status:active|locked,createdAt,updatedAt,deletedAt}`.
- `healthcare_staff`: `{userId:ObjectId,workplace,staffCode(unique),createdAt}`; `userId` tham chiếu `users._id`.
- `user_sessions`: `{userId:ObjectId,tokenHash,createdAt,expiresAt,revokedAt}`; TTL index trên `expiresAt`. Khi triển khai thật, lưu hash token/refresh token thực tế, không lưu bearer token thô.
- `patients`: `{createdById:ObjectId,patientCode,encryptedData,createdAt,updatedAt,deletedAt}`. `encryptedData` chứa họ tên, ngày sinh, giới tính, số điện thoại và địa chỉ; phạm vi truy cập giới hạn theo `createdById`.
- `predictions`: `{ownerId:ObjectId,patientId:ObjectId|null,batchId:ObjectId|null,mode,riskLevel,probability,encryptedData,modelVersion,createdAt,deletedAt}`. `encryptedData` chứa đầu vào, các yếu tố SHAP, tư vấn và cảnh báo model.
- `prediction_batches`: `{staffId:ObjectId,templateId:ObjectId|null,fileName,totalRows,validRows,errorRows,status,encryptedRows,createdAt,predictedAt,completedRows,failedRows}`. Dữ liệu hợp lệ chờ xác nhận được mã hóa; tệp upload gốc bị xóa sau khi kiểm tra.
- `batch_row_errors`: `{batchId:ObjectId,rowNo,columnName,errorMessage,createdAt}`.
- `excel_templates`: `{uploadedBy:ObjectId,templateName,fileName,filePath,version,isActive,uploadedAt,deletedAt}`. File mẫu được giữ trên filesystem của backend.
- `activity_logs`: `{userId:ObjectId|null,actionType,targetTable,targetId,description,ipAddress,createdAt}`.

MongoDB validator nên được bổ sung ở môi trường triển khai để ràng buộc enum/kiểu dữ liệu; driver và Pydantic/Zod hiện xác thực ở tầng ứng dụng. Unique index email, phone sparse, staffCode và index tra cứu theo owner/thời gian được tạo lúc khởi động. MongoDB transaction yêu cầu replica set; bản khung không dựa vào transaction để chạy local standalone.
