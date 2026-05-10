import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export const metadata = {
  title: 'Contact Us',
  description: 'Get in touch with the Bookalocal team for support, partnerships, or press inquiries.',
};

export default function ContactPage() {
  const contacts = [
    { icon: '🆘', label: 'Support', email: 'support@bookalocal.com', desc: 'Booking issues, refunds, account problems.' },
    { icon: '🤝', label: 'Guides',  email: 'guides@bookalocal.com',  desc: 'Questions about joining the platform as a guide.' },
    { icon: '⚖️', label: 'Legal',   email: 'legal@bookalocal.com',   desc: 'Privacy, terms, and policy questions.' },
    { icon: '📰', label: 'Press',   email: 'press@bookalocal.com',   desc: 'Media inquiries and partnerships.' },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50 pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h1 className="font-display text-4xl font-bold text-gray-900 mb-2">Get in touch</h1>
            <p className="text-gray-500">We aim to respond within one business day.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contacts.map(({ icon, label, email, desc }) => (
              <a
                key={label}
                href={`mailto:${email}`}
                className="bg-white rounded-2xl shadow-card p-6 hover:shadow-md transition-shadow border border-transparent hover:border-brand-orange/30"
              >
                <div className="text-3xl mb-3">{icon}</div>
                <h2 className="font-semibold text-gray-900 mb-1">{label}</h2>
                <p className="text-sm text-gray-500 mb-3">{desc}</p>
                <span className="text-sm text-brand-orange font-medium">{email} →</span>
              </a>
            ))}
          </div>

          <div className="mt-10 bg-white rounded-2xl shadow-card p-8 text-center">
            <h2 className="font-semibold text-gray-900 mb-2">Office</h2>
            <p className="text-gray-500 text-sm">
              Bookalocal Pvt. Ltd.<br />
              Kathmandu, Nepal
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
