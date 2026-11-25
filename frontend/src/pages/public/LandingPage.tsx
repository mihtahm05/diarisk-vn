import { ArrowRight, Bot, ClipboardCheck, History, ShieldCheck, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";
import Logo, { BrandName } from "../../components/Logo";
import "./landing.css";

const steps = [
  { icon: ClipboardCheck, title: "Nhập thông tin", text: "Trả lời các câu hỏi theo nhóm thông tin cơ thể, lối sống và sức khỏe." },
  { icon: Bot, title: "Mô hình AI phân tích", text: "Thông tin được xử lý để tạo một ước tính tham khảo theo mô hình hiện có." },
  { icon: Stethoscope, title: "Nhận kết quả có ngữ cảnh", text: "Xem mức nguy cơ, xác suất và các yếu tố đóng góp vào kết quả." },
];

export default function LandingPage() {
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

        <div className="landing-hero-visual" aria-label="Minh họa kết quả sức khỏe tham khảo">
          <div className="landing-risk-card">
            <div className="landing-risk-ring">
              <div>
                <small>Hình minh họa — mức ước tính</small>
                <strong>22%</strong>
                <span>Nguy cơ thấp</span>
              </div>
            </div>
          </div>
          <div className="landing-float-card landing-float-card-left">
            <span className="landing-float-icon">♡</span>
            <div><small>Chỉ số sức khỏe</small><b>Đang ổn định</b></div>
          </div>
          <div className="landing-float-card landing-float-card-right">
            <span className="landing-float-icon landing-float-icon-teal">↗</span>
            <div><small>Yếu tố tích cực</small><b>Hoạt động thể lực</b></div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="features" aria-labelledby="features-title">
        <div className="landing-section-heading">
          <span>ĐỊNH HƯỚNG SỨC KHỎE</span>
          <h2 id="features-title">Từ câu hỏi đến kết quả dễ hiểu</h2>
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
        </div>
        <ol>
          {["Nhập thông tin cơ bản", "Trả lời khảo sát", "Xem lại dữ liệu", "Nhận kết quả và giải thích"].map((label, index) => (
            <li key={label}><span>{index + 1}</span><b>{label}</b></li>
          ))}
        </ol>
      </section>

      <section className="landing-limitations" id="limitations" aria-label="Hạn chế của mô hình">
        <ShieldCheck aria-hidden="true" />
        <p><strong>Lưu ý:</strong> Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo và chưa được kiểm định lâm sàng tại Việt Nam. Kết quả chỉ mang tính tham khảo, không thay thế chẩn đoán hoặc tư vấn của bác sĩ chuyên môn.</p>
      </section>

      <footer className="landing-footer">
        <div className="landing-brand"><Logo size={32} /><BrandName /></div>
        <p>Hệ thống hỗ trợ đánh giá nguy cơ sức khỏe dựa trên AI.</p>
      </footer>
    </main>
  );
}
