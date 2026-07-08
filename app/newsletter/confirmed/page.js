// /newsletter/confirmed — the double-opt-in success landing page. noindex.
import { NewsletterShell } from '../ui';

export const metadata = {
  title: 'You’re in | The Field Guide',
  robots: { index: false, follow: false },
};

export default function NewsletterConfirmed() {
  return (
    <NewsletterShell eyebrow="The Field Guide" title="You're in.">
      <p>First issue lands Tuesday. Until then, have a poke around the blog &mdash; that&rsquo;s where everything ends up.</p>
    </NewsletterShell>
  );
}
