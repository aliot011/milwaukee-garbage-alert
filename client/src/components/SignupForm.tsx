import { useState } from "react";
import { STREET_NAMES, STREET_TYPES } from "@/addressOptions";

export default function SignupForm() {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [laddr, setLaddr] = useState("");
  const [sdir, setSdir] = useState("");
  const [sname, setSname] = useState("");
  const [stype, setStype] = useState("");
  const [termsChecked, setTermsChecked] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const phoneDigits = phone.replace(/\D/g, "");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isValid =
    phoneDigits.length === 10 && emailValid && !!laddr.trim() && !!sdir && !!sname && !!stype && termsChecked;

  function formatPhone(raw: string) {
    let digits = raw.replace(/\D/g, "").slice(0, 10);
    let out = "";
    if (digits.length > 0) out = "(" + digits.slice(0, 3);
    if (digits.length >= 4) out += ") " + digits.slice(3, 6);
    if (digits.length >= 7) out += "-" + digits.slice(6, 10);
    return out;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!isValid) return;

    const parts = [laddr.trim()];
    if (sdir) parts.push(sdir);
    parts.push(sname);
    parts.push(stype);
    const faddr = parts.join(" ");

    setLoading(true);
    try {
      const res = await fetch("/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "+1" + phoneDigits,
          email: email.trim(),
          laddr: laddr.trim(),
          sdir,
          sname,
          stype,
          faddr,
          sms_consent: smsOptIn,
          consent_source: window.location.href,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStatus({
          type: "success",
          text: "Got it! You have been signed up for Milwaukee Garbage Alerts.",
        });
        setPhone("");
        setEmail("");
        setLaddr("");
        setSdir("");
        setSname("");
        setStype("");
        setTermsChecked(false);
        setSmsOptIn(false);
      } else {
        setStatus({
          type: "error",
          text: data?.error || "Something went wrong. Please check your address and try again.",
        });
      }
    } catch {
      setStatus({ type: "error", text: "Network error. Please check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Phone */}
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-foreground">
          Mobile phone number <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center border border-input rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
          <span className="px-3 py-2 bg-muted text-muted-foreground text-sm border-r border-input whitespace-nowrap">
            +1
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="(414) 555-1234"
            className="flex-1 px-3 py-2 text-sm bg-white outline-none"
            autoComplete="tel"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">US number, 10 digits.</p>
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-foreground">
          Email address <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 text-sm border border-input rounded-lg outline-none focus:ring-2 focus:ring-ring"
          autoComplete="email"
          required
        />
      </div>

      {/* Address */}
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-foreground">
          Address (Milwaukee) <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-[2fr_1fr_3fr_1.5fr] gap-1.5">
          <input
            type="text"
            value={laddr}
            onChange={(e) => setLaddr(e.target.value)}
            placeholder="1403"
            className="min-w-0 w-full px-3 py-2 text-sm border border-input rounded-lg outline-none focus:ring-2 focus:ring-ring"
            required
          />
          <select
            value={sdir}
            onChange={(e) => setSdir(e.target.value)}
            className="min-w-0 w-full px-1 py-2 text-sm border border-input rounded-lg outline-none focus:ring-2 focus:ring-ring bg-white"
            required
          >
            <option value="" disabled>–</option>
            <option value="N">N</option>
            <option value="S">S</option>
            <option value="E">E</option>
            <option value="W">W</option>
          </select>
          <select
            value={sname}
            onChange={(e) => setSname(e.target.value)}
            className="min-w-0 w-full px-1 py-2 text-sm border border-input rounded-lg outline-none focus:ring-2 focus:ring-ring bg-white truncate"
            required
          >
            <option value="" disabled>-STREET-</option>
            {STREET_NAMES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={stype}
            onChange={(e) => setStype(e.target.value)}
            className="min-w-0 w-full px-1 py-2 text-sm border border-input rounded-lg outline-none focus:ring-2 focus:ring-ring bg-white"
            required
          >
            <option value="" disabled>-TYPE-</option>
            {STREET_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Example: <strong>1403 E POTTER AV</strong> → 1403 / E / POTTER / AV.
        </p>
      </div>

      {/* Terms checkbox */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={termsChecked}
          onChange={(e) => setTermsChecked(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="text-xs text-muted-foreground">
          I agree to the{" "}
          <a href="/terms" className="underline text-primary">Terms of Service</a> and{" "}
          <a href="/privacy" className="underline text-primary">Privacy Policy</a>.{" "}
          <span className="text-red-500">*</span>
        </span>
      </label>

      {/* SMS opt-in checkbox */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={smsOptIn}
          onChange={(e) => setSmsOptIn(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="text-xs text-muted-foreground">
          By checking, you are allowing to receive transactional/informational SMS communications
          regarding trash &amp; recycling pickup dates and service updates for the address provided.
          Message and data rates may apply. Reply HELP for help or STOP to opt-out.
        </span>
      </label>

      {/* Status message */}
      {status && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            status.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {status.text}
        </div>
      )}

      <button
        type="submit"
        disabled={!isValid || loading}
        className="w-full py-2.5 rounded-full text-sm font-semibold text-amber-900 bg-amber-400 hover:bg-amber-500 disabled:bg-amber-100 disabled:text-amber-400 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Signing you up…" : "Sign up for alerts"}
      </button>
    </form>
  );
}
