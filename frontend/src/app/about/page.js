import Link from 'next/link';

export const metadata = {
  title: 'About Us — Bookalocal',
  description: 'Learn about Bookalocal — Nepal\'s trusted local guide marketplace.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="bg-gray-900 text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Connecting Travelers with <span className="text-brand-orange">Nepal's Best Guides</span>
          </h1>
          <p className="text-xl text-gray-300 leading-relaxed">
            Bookalocal is a marketplace that empowers local guides and gives travelers authentic, meaningful experiences in Nepal.
          </p>
        </div>
      </div>

      {/* Mission */}
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {[
            { icon: '🌍', title: 'Our Mission', desc: 'To create sustainable livelihoods for Nepal\'s local guides while giving travelers unforgettable, authentic experiences beyond the tourist trail.' },
            { icon: '💚', title: 'Our Values', desc: 'We believe in fair pay, authentic connections, and responsible tourism. Guides keep 85% of every booking — always.' },
            { icon: '🏔️', title: 'Our Story', desc: 'Founded in 2024 by a team of travelers and local entrepreneurs who saw how much value local knowledge adds — and how little guides were often compensated.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="text-center p-6">
              <div className="text-5xl mb-4">{icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
              <p className="text-gray-600 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="bg-gray-50 rounded-3xl p-10 mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">How Bookalocal Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Search', desc: 'Browse verified local guides across Nepal by activity, location, and budget.' },
              { step: '2', title: 'Book', desc: 'Select your date and pay just 15% online to secure your booking.' },
              { step: '3', title: 'Meet', desc: 'Your guide will confirm and meet you at the agreed location.' },
              { step: '4', title: 'Pay & Review', desc: 'Pay the remaining 85% directly to your guide and leave a review.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 bg-brand-orange text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-3">{step}</div>
                <h4 className="font-bold text-gray-900 mb-2">{title}</h4>
                <p className="text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {[
            { value: '500+', label: 'Verified Guides' },
            { value: '50+', label: 'Unique Experiences' },
            { value: '10,000+', label: 'Happy Travelers' },
            { value: '85%', label: 'Goes to Guides' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center p-6 bg-white rounded-2xl shadow-card">
              <div className="text-3xl font-bold text-brand-orange mb-1">{value}</div>
              <div className="text-sm text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="bg-gray-50 py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-3">Get in Touch</h2>
          <p className="text-center text-gray-600 mb-10">We'd love to hear from you — travelers, guides, and partners.</p>
          <div className="bg-white rounded-2xl shadow-card p-8 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" className="input-field" placeholder="Your name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" className="input-field" placeholder="you@example.com" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <select className="input-field">
                <option>General Inquiry</option>
                <option>Become a Guide</option>
                <option>Booking Issue</option>
                <option>Partnership</option>
                <option>Press</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea rows={5} className="input-field resize-none" placeholder="Tell us how we can help..." />
            </div>
            <button className="btn-primary w-full py-3 text-base">Send Message</button>
          </div>

          <div className="mt-8 flex flex-wrap gap-6 justify-center text-sm text-gray-600">
            <a href="mailto:hello@bookalocal.com" className="flex items-center gap-2 hover:text-brand-orange">
              📧 hello@bookalocal.com
            </a>
            <span className="flex items-center gap-2 text-gray-500">
              📞 Contact email below
            </span>
            <span className="flex items-center gap-2">
              📍 Thamel, Kathmandu, Nepal
            </span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-brand-orange py-16 px-4 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">Ready to explore Nepal?</h2>
        <p className="text-orange-100 mb-8 text-lg">Find your perfect local guide and start your adventure today.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/search" className="bg-white text-brand-orange font-semibold px-8 py-3 rounded-xl hover:bg-orange-50 transition-colors">
            Find a Guide
          </Link>
          <Link href="/register?role=guide" className="border-2 border-white text-white font-semibold px-8 py-3 rounded-xl hover:bg-orange-600 transition-colors">
            Become a Guide
          </Link>
        </div>
      </div>
    </div>
  );
}
