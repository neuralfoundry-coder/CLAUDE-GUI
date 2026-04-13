import type { Metadata } from 'next';
import 'highlight.js/styles/github-dark.css';
import '@xterm/xterm/css/xterm.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClaudeGUI',
  description: 'Web-based IDE wrapping Claude CLI',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem('claudegui-layout')||'{}');var t=s&&s.state&&s.state.theme||'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t==='light'?'light':'dark'}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
