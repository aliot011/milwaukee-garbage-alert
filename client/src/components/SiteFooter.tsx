export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white py-6 px-4">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>© 2025 JHAI LLC</span>
        <div className="flex gap-5">
          <a href="/privacy" className="hover:text-foreground hover:underline transition-colors">
            Privacy Policy
          </a>
          <a href="/terms" className="hover:text-foreground hover:underline transition-colors">
            Terms of Service
          </a>
          <a
            href="mailto:support@milwaukeegarbagealert.com"
            className="hover:text-foreground hover:underline transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
