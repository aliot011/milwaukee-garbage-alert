import SiteFooter from "@/components/SiteFooter";

export default function Terms() {
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
          <h1 className="text-3xl font-extrabold mb-4">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-6">
            By signing up for MKE Pickup Alerts ("Service"), you agree to these Terms of Service.
          </p>

          <h2 className="text-lg font-bold mt-8 mb-2">Service description</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The Service sends SMS reminders about City of Milwaukee garbage and recycling pickup
            dates based on the address you provide.
          </p>

          <h2 className="text-lg font-bold mt-8 mb-2">SMS consent</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>By signing up, you consent to receive SMS reminders at the number you provide.</li>
            <li>Up to 4 msgs/month.</li>
            <li>Message and data rates may apply.</li>
            <li>Reply HELP for information and support.</li>
          </ul>

          <h2 className="text-lg font-bold mt-8 mb-2">Opting out</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can opt out at any time by replying STOP. When you opt out, Twilio marks your
            number as blocked for this Service and returns error <strong>30908</strong>. We treat
            that signal as a hard stop and will not send further messages unless you explicitly opt
            back in.
          </p>

          <h2 className="text-lg font-bold mt-8 mb-2">Your responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>Provide a valid mobile number and correct address information.</li>
            <li>Keep your phone number up to date if it changes.</li>
          </ul>

          <h2 className="text-lg font-bold mt-8 mb-2">Disclaimer</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The Service is provided "as is" without warranties of any kind. We are not responsible
            for missed pickups, delays, or delivery failures outside our control.
          </p>

          <h2 className="text-lg font-bold mt-8 mb-2">Contact</h2>
          <p className="text-sm text-muted-foreground">
            If you have questions about these terms, email{" "}
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
