const logoUrl = new URL("../../../assets/images/logo.png", import.meta.url).href;

/** Khung thương hiệu bên trái (logo, slogan) dùng chung cho các trang auth theo Figma. */
export default function BrandPanel() {
  return (
    <section className="fg-brand" aria-label="DiaRisk VN">
      <img className="fg-logo" src={logoUrl} alt="Logo DiaRisk VN" />
      <h1 className="fg-title"><span>Dia</span>Risk VN</h1>
      <p className="fg-slogan">
        Phân tích dữ liệu - Dự đoán nguy cơ
        <br />
        Đồng hành cùng bạn phòng ngừa đái tháo đường
      </p>
    </section>
  );
}