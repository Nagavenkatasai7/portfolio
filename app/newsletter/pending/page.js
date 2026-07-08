// /newsletter/pending — where a signup lands (and where a bad/expired confirm
// link is redirected with ?state=expired). noindex.
import { NewsletterShell } from '../ui';

export const dynamic = 'force-dynamic'; // reads the ?state search param
export const metadata = {
  title: 'Check your inbox | The Field Guide',
  robots: { index: false, follow: false },
};

export default async function NewsletterPending({ searchParams }) {
  const sp = (await searchParams) || {};
  const expired = sp.state === 'expired';

  if (expired) {
    return (
      <NewsletterShell eyebrow="The Field Guide" title="That link has expired.">
        <p>Confirmation links last 7 days and can only be used once. Head back to the homepage and sign up again — we&rsquo;ll send you a fresh one right away.</p>
      </NewsletterShell>
    );
  }

  return (
    <NewsletterShell eyebrow="The Field Guide · Almost there" title="Check your inbox.">
      <p>Click the confirm link we just emailed you to finish signing up. If it&rsquo;s not there in a minute, check your spam or promotions folder.</p>
    </NewsletterShell>
  );
}
