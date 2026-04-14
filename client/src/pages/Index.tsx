import { Recycle, Trash2 } from "lucide-react";
import SignupForm from "@/components/SignupForm";
import HowItWorks from "@/components/HowItWorks";
import CommandsSection from "@/components/CommandsSection";
import SiteFooter from "@/components/SiteFooter";

const Index = () => (
  <div className="min-h-screen flex flex-col">
    {/* Hero */}
    <section className="relative overflow-hidden bg-primary text-primary-foreground">
      {/* Decorative icons */}
      <Trash2 className="absolute -top-6 -left-6 w-48 h-48 opacity-[0.06] rotate-12" />
      <Recycle className="absolute -bottom-10 right-4 w-56 h-56 opacity-[0.06] -rotate-12" />

      <div className="relative max-w-5xl mx-auto px-4 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-start">
        {/* Left — copy */}
        <div className="space-y-6 animate-fade-up">
          <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight">
            MKE Garbage
            <br />
            Pickup Alerts
          </h1>
          <p className="text-lg leading-relaxed opacity-90 max-w-md">
            Get a text the night before your City of Milwaukee garbage and/or recycling pickup — never miss a collection day again.
          </p>
          <div className="flex items-center gap-3 text-sm opacity-75">
            <Recycle className="w-5 h-5" />
            <span>Free &middot; Up to 4 texts/month &middot; Cancel anytime</span>
          </div>
          <p className="text-sm opacity-75 mt-2">
            🚧 This service is currently under construction. Sign up now and you'll receive a notification when it goes live.
          </p>
        </div>

        {/* Right — form card */}
        <div className="bg-card text-card-foreground rounded-2xl shadow-card p-6 lg:p-8 animate-fade-up" style={{ animationDelay: "150ms" }}>
          <h2 className="text-xl font-bold mb-1">Sign Up For Alerts</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Input your information to get started.
          </p>
          <SignupForm />
        </div>
      </div>
    </section>

    {/* How it works */}
    <HowItWorks />

    {/* Commands */}
    <CommandsSection />

    {/* Privacy note */}
    <section className="py-12 px-4 text-center">
      <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
        Your phone number is only used to send pickup reminders and respond to your commands.
        No mobile information will be shared with third parties/affiliates for marketing or promotional purposes.
      </p>
    </section>

    <div className="mt-auto">
      <SiteFooter />
    </div>
  </div>
);

export default Index;
