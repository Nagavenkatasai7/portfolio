import Coldstart from './coldstart/Coldstart.js';
import './coldstart/coldstart.css';
export const dynamic = 'force-static';
export const metadata = {
  title: 'Naga Venkata Sai Chennu — AI Systems Engineer',
  description: 'LLM systems, evals, and serving. An executable graph of my work: press R to run it.',
  alternates: { canonical: '/' },
  openGraph: { title: 'Naga Venkata Sai Chennu — AI Systems Engineer', description: 'An executable graph of my work.', url: '/', images: ['/profile.png'] },
  twitter: { card: 'summary_large_image' },
};
export default function Page() {
  return (<>
    <noscript><p>JavaScript is off. <a href="/plain">Read the plain text résumé</a>.</p></noscript>
    <Coldstart />
  </>);
}
