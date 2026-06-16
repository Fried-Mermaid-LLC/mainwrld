import React from 'react';
import { Book } from '@/types';

export const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }: any) => {
  const base = "h-14 rounded-2xl font-bold text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2";
  const styles: any = {
    primary: "bg-accent text-white shadow-xl shadow-accent/20",
    secondary: "bg-gray-50 dark:bg-gray-900 text-gray-500",
    outline: "border-2 border-gray-100 dark:border-gray-900 text-gray-400",
    ghost: "text-gray-400 hover:text-accent",
    destructive: "bg-red-500/10 text-red-500"
  };
  return (
    <button disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]} ${className} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
      {children}
    </button>
  );
};

export const Input = ({ label, type = 'text', value, onChange, placeholder, description, maxLength }: any) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2">{label}</label>}
    <input
      type={type}
      value={value || ''}
      maxLength={maxLength}
      onChange={(e) => onChange && onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl px-6 py-4 text-sm font-medium focus:ring-2 focus:ring-accent/20 outline-none transition-all"
    />
    {description && <p className="text-[8px] font-bold text-gray-300 uppercase tracking-tighter ml-2">{description}</p>}
  </div>
);

export const CoverImg = ({ book }: { book: Book }) => book.coverImage ? (
  <img src={book.coverImage} className="absolute inset-0 w-full h-full object-cover z-0" />
) : (
  <div className="absolute inset-0 flex items-center justify-center p-4 z-0">
    <span className="text-white text-center font-bold text-lg leading-tight drop-shadow-lg" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
      {book.title}
    </span>
  </div>
);

export default {
  Button,
  Input,
  CoverImg,
};