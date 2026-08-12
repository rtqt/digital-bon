import Link from 'next/link';

export default function Home() {
  const routes = [
    { href: '/mobile', icon: '📱', label: 'Waitstaff PWA', description: 'Place orders, manage shift, view status in real time' },
    { href: '/barista', icon: '🎯', label: 'Barista Station', description: 'Live ticket queue with acknowledge & print-fail alerts' },
    { href: '/cashier', icon: '🏦', label: 'Cashier Command Center', description: 'Settle orders, manage voids, run shift reconciliation' },
    { href: '/admin', icon: '⚙️', label: 'Admin Dashboard', description: 'Menu CMS, 86-toggle, staff & role management' },
    { href: '/superadmin', icon: '🌐', label: 'Super Admin', description: 'Manage franchises, cafes, and system settings' },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center">
        <div className="text-5xl mb-4">☕</div>
        <h1 className="text-3xl font-bold">DigitalBon</h1>
        <p className="text-muted-foreground mt-2">Local-first cafe POS for Ethiopian hospitality</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
        {routes.map(r => (
          <Link key={r.href} href={r.href}
            className="p-5 rounded-2xl border border-border bg-card hover:bg-card/80 transition-all duration-150 active:scale-[0.97] flex flex-col gap-2 group"
          >
            <span className="text-2xl">{r.icon}</span>
            <span className="font-semibold text-sm group-hover:text-primary transition-colors duration-150">{r.label}</span>
            <span className="text-xs text-muted-foreground leading-relaxed">{r.description}</span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Works fully offline on local Wi-Fi · API at localhost:4000</p>
    </div>
  );
}
