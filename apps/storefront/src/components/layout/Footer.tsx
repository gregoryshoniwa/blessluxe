import Link from "next/link";
import Image from "next/image";
import {
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  CreditCard,
} from "lucide-react";

const footerLinks = {
  shop: {
    title: "Shop",
    links: [
      { href: "/collections/new-in", label: "New Arrivals" },
      { href: "/collections/dresses", label: "Dresses" },
      { href: "/collections/tops", label: "Tops" },
      { href: "/collections/bottoms", label: "Bottoms" },
      { href: "/collections/sets", label: "Sets" },
      { href: "/collections/accessories", label: "Accessories" },
      { href: "/collections/sale", label: "Sale" },
    ],
  },
  help: {
    title: "Customer Care",
    links: [
      { href: "/help/faq", label: "FAQ" },
      { href: "/help/shipping", label: "Shipping & Delivery" },
      { href: "/help/returns", label: "Returns & Exchanges" },
      { href: "/help/sizing", label: "Size Guide" },
      { href: "/contact", label: "Contact Us" },
      { href: "/track-order", label: "Track Order" },
    ],
  },
  company: {
    title: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/careers", label: "Careers" },
      { href: "/sustainability", label: "Sustainability" },
      { href: "/press", label: "Press" },
      { href: "/affiliates", label: "Affiliate Program" },
    ],
  },
};

const socialLinks = [
  { href: "https://instagram.com/blessluxe", icon: Instagram, label: "Instagram" },
  { href: "https://facebook.com/blessluxe", icon: Facebook, label: "Facebook" },
  { href: "https://twitter.com/blessluxe", icon: Twitter, label: "Twitter" },
  { href: "https://youtube.com/blessluxe", icon: Youtube, label: "YouTube" },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-black text-white">
      {/* Main Footer */}
      <div className="max-w-[1400px] mx-auto px-[5%] py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <Image
              src="/logo.png"
              alt="BLESSLUXE"
              width={150}
              height={50}
              className="h-12 w-auto brightness-0 invert mb-6"
            />
            <p className="text-white/70 text-sm leading-relaxed mb-6">
              Curating luxury fashion for the modern woman. Embrace elegance,
              embody confidence, experience BLESSLUXE.
            </p>
            {/* Social Links */}
            <div className="flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 border border-white/30 rounded-full flex items-center justify-center hover:bg-gold hover:border-gold transition-all hover:-translate-y-1"
                  aria-label={social.label}
                >
                  <social.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Shop Links */}
          <div>
            <h4 className="font-display text-sm tracking-widest uppercase text-gold mb-6">
              {footerLinks.shop.title}
            </h4>
            <ul className="space-y-3">
              {footerLinks.shop.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/70 text-sm hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help Links */}
          <div>
            <h4 className="font-display text-sm tracking-widest uppercase text-gold mb-6">
              {footerLinks.help.title}
            </h4>
            <ul className="space-y-3">
              {footerLinks.help.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/70 text-sm hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="font-display text-sm tracking-widest uppercase text-gold mb-6">
              {footerLinks.company.title}
            </h4>
            <ul className="space-y-3">
              {footerLinks.company.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/70 text-sm hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-[1400px] mx-auto px-[5%] py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Copyright */}
            <p className="text-white/50 text-sm text-center md:text-left">
              © {currentYear} BLESSLUXE. All rights reserved.
            </p>

            {/* Legal Links */}
            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/privacy"
                className="text-white/50 hover:text-gold transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-white/50 hover:text-gold transition-colors"
              >
                Terms of Service
              </Link>
            </div>

            {/* Payment Icons */}
            <div className="flex items-center gap-3">
              <CreditCard className="w-8 h-6 text-white/50" />
              <span className="text-white/30 text-xs">Visa</span>
              <span className="text-white/30 text-xs">Mastercard</span>
              <span className="text-white/30 text-xs">PayPal</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
