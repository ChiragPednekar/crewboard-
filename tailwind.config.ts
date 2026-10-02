import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1440px' } },
    extend: {
      opacity: { 8: '0.08', 12: '0.12', 35: '0.35', 65: '0.65' },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk Variable"', '"Space Grotesk"', '"Inter Variable"', 'ui-sans-serif', 'sans-serif'],
      },
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        card: { DEFAULT: token('surface'), foreground: token('foreground') },
        popover: { DEFAULT: token('surface-2'), foreground: token('foreground') },
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground'), text: token('primary-text') },
        violet: { DEFAULT: token('violet'), text: token('violet-text') },
        secondary: { DEFAULT: token('surface-2'), foreground: token('foreground') },
        muted: { DEFAULT: token('surface-2'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('surface-2'), foreground: token('foreground') },
        destructive: { DEFAULT: token('danger'), foreground: token('danger-foreground') },
        success: { DEFAULT: token('success'), text: token('success-text') },
        warning: { DEFAULT: token('warning'), text: token('warning-text') },
        danger: { DEFAULT: token('danger'), text: token('danger-text') },
        info: { DEFAULT: token('info'), text: token('info-text') },
        gold: { DEFAULT: token('gold'), text: token('gold-text') },
        silver: { DEFAULT: token('silver'), text: token('silver-text') },
        bronze: { DEFAULT: token('bronze'), text: token('bronze-text') },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)', // 16px cards
        lg: 'var(--radius)', // 12px
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 6px)',
      },
      boxShadow: {
        soft: '0 1px 2px hsl(var(--shadow) / 0.10), 0 8px 24px -12px hsl(var(--shadow) / 0.35)',
        lift: '0 2px 4px hsl(var(--shadow) / 0.12), 0 18px 40px -16px hsl(var(--shadow) / 0.45)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.35), 0 10px 40px -12px hsl(var(--primary) / 0.45)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
