import { useState } from "react";
import { ArrowRight, Bot, ClipboardCheck, Heart, History, Mail, ShieldCheck, Stethoscope, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import Logo, { BrandName } from "../../components/Logo";
import "./landing.css";

const steps = [
  { icon: ClipboardCheck, title: "Nhập thông tin", text: "Trả lời các câu hỏi theo nhóm thông tin cơ thể, lối sống và sức khỏe." },
  { icon: Bot, title: "Mô hình AI phân tích", text: "Thông tin được xử lý để tạo một ước tính tham khảo theo mô hình hiện có." },
  { icon: Stethoscope, title: "Nhận kết quả có ngữ cảnh", text: "Xem mức nguy cơ, xác suất và các yếu tố đóng góp vào kết quả." },
];

const previewScenarios = [
  {
    label: "Lối sống lành mạnh",
    score: 22,
    tone: "low",
    status: "Đang ổn định",
    factorLabel: "Yếu tố tích cực",
    factor: "Hoạt động thể lực",
  },
  {
    label: "Ít vận động & BMI cao",
    score: 48,
    tone: "medium",
    status: "Cần theo dõi BMI",
    factorLabel: "Yếu tố lưu ý",
    factor: "Ít vận động thể chất",
  },
  {
    label: "Nhiều yếu tố nguy cơ",
    score: 76,
    tone: "high",
    status: "Khuyến nghị tầm soát sớm",
    factorLabel: "Yếu tố tác động",
    factor: "Huyết áp & Chỉ số BMI",
  },
] as const;

export default function LandingPage() {
  const [activePreview, setActivePreview] = useState(0);
  const preview = previewScenarios[activePreview];

  const selectPreview = (index: number) => {
    if (index === activePreview) return;
    setActivePreview(index);
  };

  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Điều hướng trang chủ">
        <Link className="landing-brand" to="/" aria-label="Trang chủ DiaRisk VN">
          <Logo size={38} />
          <BrandName />
        </Link>
        <div className="landing-nav-links">
          <a href="#features">Tính năng</a>
          <a href="#process">Cách hoạt động</a>
          <a href="#limitations">Hạn chế</a>
        </div>
        <div className="landing-nav-actions">
          <Link className="landing-btn landing-btn-secondary" to="/login">Đăng nhập</Link>
          <Link className="landing-btn landing-btn-primary" to="/register">Tạo tài khoản</Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span>AI hỗ trợ sức khỏe</span><i /></div>
          <h1>Hiểu nguy cơ sức khỏe <span>trước khi thăm khám.</span></h1>
          <p>DiaRisk VN hỗ trợ người dùng và cán bộ y tế đánh giá nguy cơ đái tháo đường bằng mô hình AI, lưu trữ lịch sử và giải thích các yếu tố ảnh hưởng.</p>
          <div className="landing-hero-actions">
            <Link className="landing-btn landing-btn-primary landing-btn-large" to="/register">
              Bắt đầu đánh giá <ArrowRight aria-hidden="true" />
            </Link>
            <a className="landing-text-link" href="#process">Xem cách hoạt động</a>
          </div>
          <div className="landing-trust">
            <span><ShieldCheck aria-hidden="true" /> Kết quả mang tính tham khảo</span>
            <span><History aria-hidden="true" /> Theo dõi lịch sử cá nhân</span>
          </div>
        </div>

        <div className={`landing-hero-visual landing-preview-${preview.tone}`} aria-label="Minh họa kết quả sức khỏe tham khảo">
          <div className="landing-risk-card" aria-label={`Minh họa mức nguy cơ ${preview.tone === "medium" ? "trung bình" : preview.tone === "low" ? "thấp" : "cao"}, không phải kết quả y khoa`}>
            <div className={`landing-risk-ring landing-risk-${preview.tone}`}>
              <div className="landing-risk-content">
                <small>Hình minh họa — mức ước tính</small>
                <strong>{preview.score}%</strong>
                <span>Nguy cơ {preview.tone === "medium" ? "trung bình" : preview.tone === "low" ? "thấp" : "cao"}</span>
              </div>
            </div>
          </div>
          <div className={`landing-float-card landing-float-card-left landing-float-${preview.tone}`}>
            <span className="landing-float-icon"><Heart aria-hidden="true" /></span>
            <div><small>Chỉ số sức khỏe</small><b>{preview.status}</b></div>
          </div>
          <div className={`landing-float-card landing-float-card-right landing-float-${preview.tone}`}>
            <span className="landing-float-icon landing-float-icon-orange"><TrendingUp aria-hidden="true" /></span>
            <div><small>{preview.factorLabel}</small><b>{preview.factor}</b></div>
          </div>
          <div className="landing-preview" aria-label="Chọn kịch bản xem trước">
            <span>Thử xem trước:</span>
            {previewScenarios.map((item, index) => (
              <button
                type="button"
                key={item.label}
                className={activePreview === index ? "is-active" : ""}
                aria-pressed={activePreview === index}
                onClick={() => selectPreview(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="features" aria-labelledby="features-title">
        <div className="landing-section-heading">
          <span>CÁCH THỨC HOẠT ĐỘNG</span>
          <h2 id="features-title">Từ câu hỏi đến kết quả dễ hiểu</h2>
          <p>Quy trình tinh gọn giúp bạn nhanh chóng nắm bắt bức tranh tổng quan về sức khỏe chuyển hóa chỉ trong vài phút.</p>
        </div>
        <div className="landing-feature-grid">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <article className="landing-feature-card" key={title}>
              <span className="landing-feature-number">0{index + 1}</span>
              <div className="landing-feature-icon"><Icon aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-process" id="process" aria-labelledby="process-title">
        <div>
          <span>QUY TRÌNH ĐÁNH GIÁ</span>
          <h2 id="process-title">Rõ ràng từng bước</h2>
          <p>Thiết kế tối ưu cho cả người dùng phổ thông và cán bộ y tế thao tác nhanh chóng, chính xác.</p>
        </div>
        <ol>
          {[
            ["Nhập thông tin cơ bản", "Tuổi, giới tính, chiều cao, cân nặng"],
            ["Trả lời khảo sát", "Thói quen sinh hoạt & bệnh sử liên quan"],
            ["Xem lại dữ liệu", "Kiểm tra tính chính xác trước khi phân tích"],
            ["Nhận kết quả & giải thích", "Báo cáo mức nguy cơ và biểu đồ yếu tố"],
          ].map(([label, description], index) => (
            <li key={label}>
              <span>{index + 1}</span>
              <b>{label}</b>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-limitations" id="limitations" aria-label="Hạn chế của mô hình">
        <ShieldCheck aria-hidden="true" />
        <p><strong>Lưu ý:</strong> Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo và chưa được kiểm định lâm sàng tại Việt Nam. Kết quả chỉ mang tính tham khảo, không thay thế chẩn đoán hoặc tư vấn của bác sĩ chuyên môn.</p>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-main">
          <div className="landing-footer-about">
            <Link className="landing-brand" to="/" aria-label="Trang chủ DiaRisk VN">
              <Logo size={34} />
              <BrandName />
            </Link>
            <p>Nền tảng ứng dụng Trí tuệ nhân tạo (XGBoost &amp; SHAP) hỗ trợ sàng lọc nguy cơ đái tháo đường, giúp người dân chủ động bảo vệ sức khỏe và hỗ trợ cán bộ y tế trong công tác tư vấn cộng đồng.</p>
            <div className="landing-footer-tags"><span>BRFSS Dataset</span><span>Explainable AI (SHAP)</span></div>
          </div>
          <div className="landing-footer-column">
            <h3>Khám phá</h3>
            <a href="#features">Tính năng chính</a>
            <a href="#features">Chế độ Phi lâm sàng</a>
            <a href="#features">Chế độ Lâm sàng</a>
            <a href="#process">Quy trình 4 bước</a>
            <a href="#limitations">Miễn trừ trách nhiệm</a>
          </div>
          <div className="landing-footer-column">
            <h3>Truy cập</h3>
            <Link to="/login">Đăng nhập hệ thống</Link>
            <Link to="/register">Đăng ký cá nhân</Link>
            <Link to="/login">Cán bộ y tế</Link>
            <a href="#limitations">Miễn trừ trách nhiệm</a>
          </div>
          <div className="landing-footer-column landing-footer-system">
            <h3>Thông tin hệ thống</h3>
            <p><span className="landing-status-dot" />Phiên bản mô hình: <b>v1.0 (Non-Clinical &amp; Clinical)</b></p>
            <p><span className="landing-status-dot landing-status-dot-green" />Trạng thái dịch vụ AI: <b>Sẵn sàng hoạt động</b></p>
            <p><Mail aria-hidden="true" />Hỗ trợ kỹ thuật: <a href="mailto:support@diarisk.vn">support@diarisk.vn</a></p>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>© 2026 DiaRisk VN. Phát triển phục vụ nghiên cứu khoa học &amp; sàng lọc sức khỏe cộng đồng.</span>
          <div><a href="#limitations">Điều khoản sử dụng</a><a href="#limitations">Chính sách bảo mật</a></div>
        </div>
      </footer>
    </main>
  );
}
