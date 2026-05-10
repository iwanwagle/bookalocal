import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export const metadata = {
  title: 'Terms of Service',
  description: 'The terms and conditions that govern use of the Bookalocal marketplace.',
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <article className="min-h-screen bg-white pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 prose prose-slate prose-sm sm:prose-base">
          <h1 className="font-display text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: May 2026</p>

          <p>
            These Terms of Service ("Terms") govern your use of <strong>Bookalocal</strong>,
            a marketplace that connects travelers with local guides in Nepal. By using the service
            you agree to these Terms.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">1. About Bookalocal</h2>
          <p>
            Bookalocal is a marketplace platform. We are not a tour operator. We do not employ the
            guides on our platform. Guides are independent service providers responsible for the
            services they offer.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">2. Bookings and payments</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Travelers pay a 15% platform fee at the time of booking via Stripe.</li>
            <li>The remaining 85% is paid directly to the guide on the day of the experience, in cash, in Nepalese Rupees.</li>
            <li>Bookings must be accepted by the guide within 24 hours, or they are automatically cancelled.</li>
            <li>If a guide rejects your booking, the 15% platform fee is refunded automatically within 5–10 business days.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">3. Cancellations</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Flexible:</strong> full refund of platform fee if cancelled at least 24 hours before the experience.</li>
            <li><strong>Moderate:</strong> full refund if cancelled at least 5 days before; 50% refund within 5 days.</li>
            <li><strong>Strict:</strong> 50% refund if cancelled at least 7 days before; no refund within 7 days.</li>
            <li>Each listing displays its cancellation policy. By booking you agree to the policy shown.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">4. Guide responsibilities</h2>
          <p>Guides agree to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Hold the appropriate permits and licenses for the experiences they offer.</li>
            <li>Carry their own liability insurance (recommended) and tell travelers their coverage.</li>
            <li>Respond to booking requests within 24 hours.</li>
            <li>Provide the experience as described in their listing.</li>
            <li>Not solicit travelers to transact off-platform.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">5. Traveler responsibilities</h2>
          <p>Travelers agree to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Bring the cash component of payment to the experience.</li>
            <li>Honestly assess their fitness for the chosen activity.</li>
            <li>Follow safety instructions given by the guide.</li>
            <li>Not hold Bookalocal responsible for injuries, losses, or disputes that arise during the experience itself.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8 mb-3">6. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Bookalocal's liability for any claim related to a
            booking is limited to the platform fee you paid for that booking. Bookalocal is not
            responsible for the acts, omissions, accuracy of representations, or quality of services
            provided by guides.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">7. Reviews</h2>
          <p>
            Reviews must reflect genuine experience. Fake reviews, paid reviews, and review trading are
            grounds for account termination. Bookalocal may remove reviews that violate these Terms or
            are clearly fraudulent.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">8. Account termination</h2>
          <p>
            We may suspend or terminate accounts that violate these Terms, attempt fraud, or pose a
            safety risk to other users.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">9. Changes</h2>
          <p>
            We may update these Terms. Material changes will be communicated by email at least 14 days
            before they take effect.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-3">10. Governing law</h2>
          <p>These Terms are governed by the laws of Nepal.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">Contact</h2>
          <p>
            Questions? Email <a href="mailto:legal@bookalocal.com" className="text-brand-orange">legal@bookalocal.com</a>.
          </p>

          <p className="mt-8 text-xs text-gray-400">
            This is a starting set of terms. Before public launch, please have them reviewed by a lawyer
            familiar with Nepal consumer protection and tourism law.
          </p>
        </div>
      </article>
      <Footer />
    </>
  );
}
