import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { person, SITE_URL } from '@/content/profile';

const description = `${person.name} — ${person.title}. ${person.summary}`;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${person.name} — ${person.title}`,
  description,
  alternates: { canonical: '/' },
  authors: [{ name: person.name, url: SITE_URL }],
  openGraph: {
    type: 'profile',
    url: '/',
    siteName: person.name,
    title: `${person.name} — ${person.title}`,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${person.name} — ${person.title}`,
    description,
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  themeColor: '#07070c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Enables the scroll-reveal styles only when JavaScript is running. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
