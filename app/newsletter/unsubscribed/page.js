// /newsletter/unsubscribed — the opt-out landing page. noindex.
import { NewsletterShell } from '../ui';

export const metadata = {
  title: 'Unsubscribed | The Field Guide',
  robots: { index: false, follow: false },
};

export default function NewsletterUnsubscribed() {
  return (
    <NewsletterShell eyebrow="The Field Guide" title="You're out — no hard feelings.">
      <p>You won&rsquo;t get any more Field Guide emails. Changed your mind? You can sign up again any time from the homepage.</p>
    </NewsletterShell>
  );
}
