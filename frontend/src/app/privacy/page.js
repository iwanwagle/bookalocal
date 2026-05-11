import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How Bookalocal collects, uses, and protects your personal information.',
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <article className="min-h-screen bg-white pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 prose prose-slate prose-sm sm:prose-base">
          <h1 className="font-display text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: May 2026</p>

          <p>
            This Privacy Policy explains how <strong>Bookalocal</strong> ("we", "us") collects,
            uses, and shares information about you when you use our marketplace connecting travelers
            with local guides in Nepal.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Information we collect</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Account info:</strong> name, email, phone number, profile photo, password (stored as a one-way hash).</li>
            <li><strong>Booking data:</strong> selected experiences, dates, party size, special requests, payment status.</li>
            <li><strong>Payment info:</strong> processed by Stripe. We never see or store your card details.</li>
            <li><strong>Guide verification (KYC):</strong> for users registering as guides, government ID type, ID number, and ID document photos. Stored encrypted at rest, accessible only to our verification team.</li>
            <li><strong>Communications:</strong> messages exchanged between travelers and guides on our platform.</li>
            <li><strong>Usage data:</strong> pages viewed, IP address, device type, browser, approximate location for analytics.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">How we use information</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>To process bookings and payments.</li>
            <li>To verify guide identity and prevent fraud.</li>
            <li>To send transactional emails (booking confirmations, password resets, reminders).</li>
            <li>To respond to support requests.</li>
            <li>To improve our service through aggregated usage analytics.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Sharing of information</h2>
          <p>We share information only with:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>The guide you booked with</strong> (name, contact, party size, special requests).</li>
            <li><strong>Stripe</strong> for payment processing.</li>
            <li><strong>Cloudinary</strong> for image hosting.</li>
            <li><strong>Authorities</strong> if required by law.</li>
          </ul>
          <p>We do <strong>not</strong> sell your data and we don't show third-party advertising.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Your rights</h2>
          <p>You can:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Access and update your profile at any time from <a href="/profile" className="text-brand-orange">Account settings</a>.</li>
            <li>Request deletion of your account by emailing us.</li>
            <li>Opt out of marketing emails (transactional emails are required for booking management).</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">Cookies</h2>
          <p>
            We use a small number of essential cookies (login session, currency preference, language)
            and one third-party currency conversion API. We don't use advertising or behavioural-tracking cookies.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Data retention</h2>
          <p>
            Booking and review records are retained for 7 years for tax and dispute resolution purposes.
            Account information can be deleted on request, though some financial records must be kept by law.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Contact</h2>
          <p>
            Questions about this policy? Email us at <a href="mailto:privacy@bookalocal.com" className="text-brand-orange">privacy@bookalocal.com</a>.
          </p>

          <p className="mt-8 text-xs text-gray-400">
            This is a starting policy. Before public launch, please have it reviewed by a lawyer
            familiar with Nepal data protection law and any jurisdictions where you serve customers.
          </p>
        </div>
      </article>
      <Footer />
    </>
  );
}
