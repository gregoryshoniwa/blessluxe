import { type ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:pointer-events-none disabled:opacity-50";

    const variants: Record<string, string> = {
      primary: "bg-gold text-white hover:bg-gold-dark",
      secondary: "bg-cream-dark text-black hover:bg-cream",
      outline: "border border-gold text-gold hover:bg-gold hover:text-white",
      ghost: "text-gold hover:bg-cream-dark",
    };

    const sizes: Record<string, string> = {
      sm: "h-8 px-3 text-sm rounded",
      md: "h-10 px-5 text-sm rounded-md",
      lg: "h-12 px-8 text-base rounded-md",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
