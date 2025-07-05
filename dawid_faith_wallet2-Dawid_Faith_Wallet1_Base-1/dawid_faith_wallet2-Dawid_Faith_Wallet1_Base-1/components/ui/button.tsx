import React from "react";

export function Button({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      className={`px-4 py-2 rounded border border-zinc-300 bg-zinc-100 hover:bg-zinc-200 text-black text-sm font-medium transition ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}