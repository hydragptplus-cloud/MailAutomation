import React from "react";

const BRAND_ASSETS = {
  full: "/brand/mail-flow-logo.png",
  mark: "/brand/mail-flow-mark.png",
};

export default function BrandLogo({
  variant = "full",
  className = "",
  alt = "Mail Flow",
}) {
  return (
    <img
      src={BRAND_ASSETS[variant]}
      alt={alt}
      className={className}
      draggable="false"
    />
  );
}
