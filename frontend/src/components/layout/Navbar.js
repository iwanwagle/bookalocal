'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuthStore, useUser } from '../../context/authStore';
import { chatAPI } from '../../utils/api';
import CurrencySelector from '../common/CurrencySelector';
import LanguageSelector from '../common/LanguageSelector';
import VerificationBanner from '../common/VerificationBanner';
import { useI18n } from '../../context/i18nContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function Navbar({ transparent = false }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { isAuthenticated, logout } = useAuthStore();
  const { t } = useI18n();
  const user = useUser();
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isTransparent = transparent && !scrolled;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { setUnreadCount(0); return; }
    const fetchUnread = () => chatAPI.getUnreadCount().then(r => setUnreadCount(r.data.unread || 0)).catch(() => {});
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const dashboardLink = user?.role === 'guide' ? '/guide/dashboard' : user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <>
      <VerificationBanner />
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isTransparent 
        ? 'bg-transparent' 
        : 'bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white font-display font-bold text-sm group-hover:bg-brand-600 transition-colors">
              BL
            </div>
            <span className={`font-display font-semibold text-lg ${isTransparent ? 'text-white' : 'text-gray-900'}`}>
              Bookalocal
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {[
              { href: '/search', label: t('nav.explore') },
              { href: '/guides', label: t('nav.guides') },
              { href: '/about', label: t('nav.about') },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === href
                    ? 'text-brand-500 bg-brand-50'
                    : isTransparent
                    ? 'text-white/90 hover:text-white hover:bg-white/10'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Desktop Auth */}
          <div className="hidden md:flex items-center gap-3">
            <CurrencySelector />
            {!isAuthenticated ? (
              <>
                <Link
                  href="/login"
                  className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                    isTransparent ? 'text-white hover:bg-white/10' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Log in
                </Link>
                <Link href="/register" className="btn-primary text-sm py-2">
                  Sign up
                </Link>
                <Link
                  href="/register?role=guide"
                  className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                    isTransparent
                      ? 'border-white/30 text-white hover:bg-white/10'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Become a Guide
                </Link>
              </>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand-orange rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-bold z-10">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                  <img
                    src={user?.avatar_url}
                    alt={user?.first_name}
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                  <div className="text-left hidden lg:block">
                    <p className="text-sm font-medium text-gray-900 leading-none">{user?.first_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-modal border border-gray-100 py-2 z-50"
                    >
                      <div className="px-4 py-2 border-b border-gray-100 mb-1">
                        <p className="text-sm font-medium text-gray-900">{user?.first_name} {user?.last_name}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>
                      {[
                        { href: dashboardLink, label: t('nav.dashboard'), icon: '📊' },
                        { href: '/bookings', label: t('nav.bookings', 'My Bookings'), icon: '📅' },
                        { href: '/messages', label: unreadCount > 0 ? `Messages (${unreadCount})` : 'Messages', icon: '💬', badge: unreadCount },
                        { href: '/wishlist', label: t('nav.wishlist'), icon: '❤️' },
                        { href: '/profile', label: t('nav.settings'), icon: '⚙️' },
                      ].map(({ href, label, icon }) => (
                        <Link
                          key={href}
                          href={href}
                          className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <span>{icon}</span>
                          <span className="flex-1">{href === '/messages' ? (unreadCount > 0 ? 'Messages' : 'Messages') : label}</span>
                          {href === '/messages' && unreadCount > 0 && (
                            <span className="ml-auto bg-brand-orange text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </Link>
                      ))}
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={logout}
                          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <span>🚪</span>
                          Log out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className={`md:hidden p-2 rounded-lg ${isTransparent ? 'text-white' : 'text-gray-700'}`}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t border-gray-100"
          >
            <div className="px-4 py-4 space-y-2">
              {['/search', '/guides', '/about'].map((href) => (
                <Link key={href} href={href} className="block px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50 capitalize" onClick={() => setMobileOpen(false)}>
                  {href.replace('/', '')}
                </Link>
              ))}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                {isAuthenticated ? (
                  <>
                    <Link href={dashboardLink} className="block px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50" onClick={() => setMobileOpen(false)}>Dashboard</Link>
                    <button onClick={logout} className="w-full text-left px-4 py-2 rounded-lg text-red-600 hover:bg-red-50">{t('nav.logout')}</button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="block btn-secondary text-center" onClick={() => setMobileOpen(false)}>{t('nav.login')}</Link>
                    <Link href="/register" className="block btn-primary text-center" onClick={() => setMobileOpen(false)}>{t('nav.signup')}</Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
    </>
  );
}
