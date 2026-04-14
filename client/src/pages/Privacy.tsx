import SiteFooter from "@/components/SiteFooter";

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-primary text-primary-foreground sticky top-0 z-10 shadow">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <a href="/" className="text-xl font-bold tracking-tight">
            MKE Garbage Pickup Alerts
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
        <article className="bg-white rounded-2xl border border-border p-8">
          <h1 className="text-3xl font-extrabold mb-4">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This Privacy Policy explains how MKE Pickup Alerts ("we," "us," or "our") collects and
            uses information when you sign up for garbage and recycling pickup reminders.
          </p>

          <h2 className="text-lg font-bold mt-8 mb-2">Information we collect</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Phone number:</strong> used to send SMS reminders
              and respond to your commands.
            </li>
            <li>
              <strong className="text-foreground">Address details:</strong> used to look up the City
              of Milwaukee collection schedule.
            </li>
          </ul>

          <h2 className="text-lg font-bold mt-8 mb-2">How we use your information</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>Send the reminder texts you request.</li>
            <li>Respond to STATUS, HELP, and other supported commands.</li>
            <li>Honor opt-out requests and keep a record that your number opted out.</li>
          </ul>

          <h2 className="text-lg font-bold mt-8 mb-2">SMS delivery and opt-out</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We send messages using Twilio. If you reply STOP, Twilio records your opt-out and
            blocks future messages. Twilio reports this status back to us as error{" "}
            <strong>30908</strong>, and we immediately stop sending texts to that number unless you
            explicitly opt back in.
          </p>

          <h2 className="text-lg font-bold mt-8 mb-2">Sharing</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We do not sell your personal information. We share it only with service providers who
            help deliver SMS messages (e.g., Twilio) and only for that purpose. No mobile
            information will be shared with third parties/affiliates for marketing/promotional
            purposes.
          </p>

          <h2 className="text-lg font-bold mt-8 mb-2">Retention</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We retain your phone number and address details only as long as needed to provide the
            service or meet legal obligations. If you opt out, we keep a minimal record of the
            opt-out to prevent further messages.
          </p>

          <h2 className="text-lg font-bold mt-8 mb-2">Contact</h2>
          <p className="text-sm text-muted-foreground">
            Questions? Email us at{" "}
            <a
              href="mailto:support@milwaukeegarbagealert.com"
              className="text-primary underline"
            >
              support@milwaukeegarbagealert.com
            </a>
            .
          </p>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
