import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props
}) => {
  return <button className={buttonClassName({ variant, size, fullWidth, className })} {...props} />;
};

type ButtonClassNameOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
}: ButtonClassNameOptions = {}) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background';

  const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-white hover:bg-primary-hover focus:ring-primary',
    secondary: 'bg-secondary text-black hover:bg-secondary-hover focus:ring-secondary',
    outline: 'border-2 border-border text-text hover:bg-card focus:ring-border',
    ghost: 'text-text-secondary hover:bg-card focus:ring-border',
  };

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-base',
    lg: 'h-12 px-6 text-lg',
  };

  const widthClasses = fullWidth ? 'w-full' : '';

  return `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClasses} ${className}`;
}
