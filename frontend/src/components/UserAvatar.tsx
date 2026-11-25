import { useEffect, useState } from "react";

function initials(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] ?? "" : ""}`.toUpperCase();
}

export default function UserAvatar({ name, src, className = "" }: {
  name?: string;
  src?: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  useEffect(() => setFailedSrc(""), [src]);

  return src && failedSrc !== src
    ? <img className={className} src={src} alt="" onError={() => setFailedSrc(src)} />
    : <span className={className} aria-hidden="true">{initials(name)}</span>;
}
