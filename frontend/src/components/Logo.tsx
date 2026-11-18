import logoImg from "../assets/images/logo.png";

export default function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <img 
      src={logoImg} 
      alt="DiaRisk VN Logo" 
      style={{ width: size, height: size, objectFit: "contain" }} 
      className={className}
    />
  );
}

export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold text-lg ${className}`}>
      DiaRisk VN
    </span>
  );
}