import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-gray-900 text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">BL</div>
              <span className="font-display font-semibold text-lg text-white">Bookalocal</span>
            </div>
            <p className="text-sm leading-relaxed mb-6 max-w-xs">
              Connecting travelers with verified local guides across Nepal for authentic, safe, and unforgettable experiences.
            </p>
            <div className="flex items-center gap-3">
              {['🐦', '📘', '📸', '▶️'].map((emoji, i) => (
                <button key={i} className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-sm transition-colors">
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Explore */}
          <div>
            <h4 className="text-white font-medium mb-4">Explore</h4>
            <ul className="space-y-2 text-sm">
              {[['Search Guides', '/search'], ['Trekking', '/search?category=hiking'], ['Cultural Tours', '/search?category=cultural'], ['Photography', '/search?category=photography'], ['Food Tours', '/search?category=food_tour']].map(([label, href]) => (
                <li key={href}><Link href={href} className="hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Guides */}
          <div>
            <h4 className="text-white font-medium mb-4">For Guides</h4>
            <ul className="space-y-2 text-sm">
              {[['Become a Guide', '/register?role=guide'], ['Guide Dashboard', '/guide/dashboard'], ['Create Listing', '/guide/listings/new'], ['Pricing Guide', '/guide/pricing'], ['Guide Resources', '/guide/resources']].map(([label, href]) => (
                <li key={href}><Link href={href} className="hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white font-medium mb-4">Company</h4>
            <ul className="space-y-2 text-sm">
              {[['About Us', '/about'], ['Contact', '/contact'], ['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']].map(([label, href]) => (
                <li key={href}><Link href={href} className="hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm">© {year} Bookalocal.com — Made with ❤️ for Nepal's local guides</p>
          <div className="flex items-center gap-6 text-sm">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Secure Payments via Stripe
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Verified Local Guides
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
