// Small shared building blocks, so the Tailwind class strings for buttons, cards and fields live
// in one place instead of being copied into every component.

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-brand-ink hover:brightness-110',
  gold: 'bg-gold text-gold-ink hover:brightness-105',
  ghost: 'border border-rule bg-transparent text-ink font-semibold hover:bg-field',
  danger: 'bg-danger text-brand-ink hover:brightness-110',
};

const BUTTON_SIZES = {
  md: 'px-4 py-3 text-sm',
  sm: 'px-3 py-2 text-xs whitespace-nowrap',
};

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    />
  );
}

// Looks like a link, behaves like a button (for in-app actions such as switching sign-in mode).
export function LinkButton({ className = '', ...props }) {
  return (
    <button
      type="button"
      className={`cursor-pointer font-bold text-brand underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Card({ as: Tag = 'div', className = '', ...props }) {
  return (
    <Tag
      className={`flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-[0_1px_0_var(--rule),0_6px_18px_-12px_rgb(40_10_60/0.35)] lg:p-5 ${className}`}
      {...props}
    />
  );
}

export const inputClass =
  'w-full min-w-0 rounded-lg border border-rule bg-field px-3 py-2.5 text-[0.95rem] font-medium text-ink placeholder:text-sub/80 disabled:opacity-60';

export function Field({ label, htmlFor, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-bold text-sub">
        {label}
      </label>
      {children}
    </div>
  );
}

// "—— or ——" divider between alternative ways of doing the same thing.
export function OrDivider({ children = 'or' }) {
  return (
    <div className="flex items-center gap-2 text-xs text-sub before:h-px before:flex-1 before:bg-rule after:h-px after:flex-1 after:bg-rule">
      {children}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-10 text-sm text-sub">
      <span className="size-9 animate-spin rounded-full border-4 border-rule border-t-brand motion-reduce:animate-none" />
      {label}
    </div>
  );
}
