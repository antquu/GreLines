import type { ReactNode } from 'react';

export function SiteHeader({
  theme,
  wordmark,
  children,
}: {
  theme: 'light' | 'dark';
  wordmark: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="docs-header">
      <a href="/app" className="flex flex-shrink-0 items-center" aria-label="GreLines">
        <img
          src={`/assets/homepage/${theme === 'dark' ? 'logo_light.png' : 'logo.png'}`}
          alt=""
          className="h-7 w-7 rounded-full"
        />
      </a>
      {wordmark}
      <div className="flex-1" />
      {children}
    </header>
  );
}

export function OpenAppLink({ label }: { label: string }) {
  return <a href="/app" className="docs-open">{label}</a>;
}
