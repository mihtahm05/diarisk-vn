#!/usr/bin/env python3
"""
Chỉnh chế độ lâm sàng cho khớp notebook BRFSS.

Chạy trong thư mục frontend:   python3 fix_clinical.py

Script sửa 3 file: src/config/features.ts, src/pages/user/PredictionPage.tsx, src/dashboard.css.
Nó chỉ sửa khi TẤT CẢ vị trí cần sửa đều tìm thấy; thiếu một chỗ là không ghi gì cả.
Trước khi ghi, mỗi file được sao lưu thành <tên file>.before-clinical
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path.cwd()
FEATURES = ROOT / "src/config/features.ts"
PAGE = ROOT / "src/pages/user/PredictionPage.tsx"
CSS = ROOT / "src/dashboard.css"

for f in (FEATURES, PAGE, CSS):
    if not f.exists():
        sys.exit(f"Không thấy {f}. Hãy chạy script trong thư mục frontend.")

# ---------------------------------------------------------------- features.ts
FEATURE_EDITS = [
    ('  heart_disease: "Tiền sử bệnh tim mạch vành",',
     '  heart_disease: "Bệnh tim mạch vành hoặc nhồi máu cơ tim",'),
    ('  heart_disease: "Đã được bác sĩ chẩn đoán",',
     '  heart_disease: "Đã được bác sĩ chẩn đoán, gồm cả trường hợp từng nhồi máu cơ tim",'),
    ('  bp_meds: "Hiện đang dùng thuốc điều trị huyết áp",',
     '  bp_meds: "Đang dùng thuốc điều trị; chỉ áp dụng khi có huyết áp cao",'),
    ('  high_chol: "Đã được bác sĩ chẩn đoán",',
     '  high_chol: "Đã được bác sĩ chẩn đoán; chưa từng đo cholesterol thì chọn Bỏ qua",'),
]

# ---------------------------------------------------------- PredictionPage.tsx
RULES_BLOCK = '''// Số câu được bỏ trống, theo notebook huấn luyện:
// phần thông tin chung tối đa 3 câu, phần tiền sử bệnh (chế độ lâm sàng) tối đa 2 câu, hai mức tính riêng.
const MAX_MISSING_GENERAL = 3;
const MAX_MISSING_HISTORY = 2;

/** Các câu được tự điền theo cách bộ dữ liệu BRFSS và notebook xử lý. */
function lockedFields(mode: PredictionMode, features: Record<string, number | string>): Record<string, string> {
  const locked: Record<string, string> = {};
  if (mode !== "clinical") return locked;
  // BPMEDS chỉ được hỏi người có huyết áp cao; notebook gán 0 khi không có huyết áp cao.
  if (features.high_bp === 0) locked.bp_meds = "Tự động là Không vì chưa có huyết áp cao";
  // _MICHD gồm cả nhồi máu cơ tim, nên đã nhồi máu thì chắc chắn là Có.
  if (features.heart_attack === 1) locked.heart_disease = "Tự động là Có vì đã từng nhồi máu cơ tim";
  return locked;
}

/** Giá trị thực sự gửi đi sau khi áp dụng các câu tự điền. */
function applyRules(mode: PredictionMode, features: Record<string, number | string>): Record<string, number | string> {
  const next = { ...features };
  const locked = lockedFields(mode, features);
  if (locked.bp_meds) next.bp_meds = 0;
  if (locked.heart_disease) next.heart_disease = 1;
  return next;
}'''

MISSING_OLD = '''  const optionalFields = FEATURE_FIELDS[mode].filter((field) => !REQUIRED.includes(field.name));
  const missingCount = optionalFields.filter((field) => features[field.name] === "" || features[field.name] === undefined).length;
  const maxMissing = MAX_MISSING[mode];
  const needMore = Math.max(0, missingCount - maxMissing);
  const tooManyMissing = needMore > 0;'''

MISSING_NEW = '''  const effective = useMemo(() => applyRules(mode, features), [mode, features]);
  const locked = useMemo(() => lockedFields(mode, features), [mode, features]);
  const isBlank = (field: FeatureField) => effective[field.name] === "" || effective[field.name] === undefined;
  const generalOptional = FEATURE_FIELDS[mode].filter((field) => field.group !== "history" && !REQUIRED.includes(field.name));
  const historyOptional = FEATURE_FIELDS[mode].filter((field) => field.group === "history");
  const generalOver = Math.max(0, generalOptional.filter(isBlank).length - MAX_MISSING_GENERAL);
  const historyOver = Math.max(0, historyOptional.filter(isBlank).length - MAX_MISSING_HISTORY);
  const needMore = generalOver + historyOver;
  const tooManyMissing = needMore > 0;
  const missingParts: string[] = [];
  if (generalOver) missingParts.push(`${generalOver} câu ở phần thông tin chung (được bỏ qua tối đa ${MAX_MISSING_GENERAL})`);
  if (historyOver) missingParts.push(`${historyOver} câu ở phần tiền sử bệnh (được bỏ qua tối đa ${MAX_MISSING_HISTORY})`);
  const missingMessage = `Cần trả lời thêm ${missingParts.join(" và ")}.`;'''

PAGE_EDITS = [
    # hằng số + hàm quy tắc
    ('const MAX_MISSING: Record<PredictionMode, number> = { nonclinical: 3, clinical: 2 };', RULES_BLOCK),
    # Segmented có thể bị khóa
    ('''function Segmented({ label, options, value, onChange }: {
  label: string;
  options: FeatureOption[];
  value: string | number;
  onChange: (value: string) => void;
}) {''',
     '''function Segmented({ label, options, value, onChange, disabled = false }: {
  label: string;
  options: FeatureOption[];
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {'''),
    ('''          <button key={String(option.value)} type="button" aria-pressed={on}
            className={on ? (option.value === "" ? "is-on is-skip" : "is-on") : undefined}''',
     '''          <button key={String(option.value)} type="button" aria-pressed={on} disabled={disabled}
            className={on ? (option.value === "" ? "is-on is-skip" : "is-on") : undefined}'''),
    # đếm câu bỏ trống
    (MISSING_OLD, MISSING_NEW),
    # thông báo lỗi khi gửi + dữ liệu gửi đi
    ('      setError(`Chế độ này chỉ cho phép bỏ trống tối đa ${maxMissing} câu (hiện bỏ trống ${missingCount}).`);',
     '      setError(missingMessage);'),
    ('features: { ...features, bmi }', 'features: { ...effective, bmi }'),
    # hiển thị từng hàng
    ('    const value = features[field.name] ?? "";\n\n    if (field.kind === "binary") {',
     '    const value = effective[field.name] ?? "";\n    const lockedNote = locked[field.name];\n\n    if (field.kind === "binary") {'),
    ('''        <Row key={field.name} label={label} hint={hint} control="seg">
          <Segmented label={label} options={[...(field.options ?? []), { value: "", label: "Bỏ qua" }]} value={value}
            onChange={(next) => setFeature(field.name, next)} />''',
     '''        <Row key={field.name} label={label} hint={lockedNote ?? hint} control="seg">
          <Segmented label={label} options={[...(field.options ?? []), { value: "", label: "Bỏ qua" }]} value={value}
            disabled={Boolean(lockedNote)} onChange={(next) => setFeature(field.name, next)} />'''),
    # câu thông báo dưới nút
    ('''              {tooManyMissing
                ? `Cần trả lời thêm ${needMore} câu để dự đoán (được bỏ qua tối đa ${maxMissing} câu).`
                : "Đã đủ thông tin để dự đoán."}''',
     '''              {tooManyMissing ? missingMessage : "Đã đủ thông tin để dự đoán."}'''),
]

# ------------------------------------------------------------------ CSS
CSS_ADD = '''
/* Câu hỏi bị khóa vì đã được tự điền (ví dụ thuốc huyết áp khi không có huyết áp cao) */
.dg-seg button:disabled { cursor: not-allowed; }
.dg-seg button.is-on:disabled { opacity: 0.75; }
'''


def apply(path, edits, label):
    text = path.read_text(encoding="utf-8")
    problems = []
    for old, _ in edits:
        n = text.count(old)
        if n != 1:
            first_line = old.strip().splitlines()[0][:80]
            problems.append(f"  - {label}: tìm thấy {n} chỗ (cần đúng 1) cho: {first_line}")
    return text, problems


page_text = PAGE.read_text(encoding="utf-8")
if "applyRules(" in page_text:
    sys.exit("PredictionPage.tsx đã được chỉnh rồi (có hàm applyRules). Không làm gì thêm.")

features_text, p1 = apply(FEATURES, FEATURE_EDITS, "features.ts")
page_text, p2 = apply(PAGE, PAGE_EDITS, "PredictionPage.tsx")
problems = p1 + p2
if problems:
    print("KHÔNG sửa gì cả vì có chỗ không khớp:")
    print("\n".join(problems))
    print("\nHãy gửi nội dung PredictionPage.tsx và features.ts hiện tại cho Claude.")
    sys.exit(1)

for old, new in FEATURE_EDITS:
    features_text = features_text.replace(old, new, 1)
for old, new in PAGE_EDITS:
    page_text = page_text.replace(old, new, 1)

css_text = CSS.read_text(encoding="utf-8")
if ".dg-seg button:disabled" not in css_text:
    css_text = css_text.rstrip("\n") + "\n" + CSS_ADD

# Không còn tham chiếu tới các biến cũ
for leftover in ("MAX_MISSING[", "maxMissing", "missingCount", "optionalFields"):
    if leftover in page_text:
        sys.exit(f"Còn sót '{leftover}' trong PredictionPage.tsx, dừng lại và không ghi file.")

for path, new_text in ((FEATURES, features_text), (PAGE, page_text), (CSS, css_text)):
    shutil.copyfile(path, str(path) + ".before-clinical")
    path.write_text(new_text, encoding="utf-8")

print("Xong. Đã sửa 3 file (bản gốc lưu ở các file *.before-clinical).")
print("Vite sẽ tự nạp lại; bấm Ctrl + Shift + R trên trình duyệt.")
