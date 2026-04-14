import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Recycle, Trash2 } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";

type State = "loading" | "success" | "error";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token") || "";

    if (!token) {
      setState("error");
      setMessage("No verification token found. Please use the link from your email.");
      return;
    }

    fetch(`/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setState("success");
        } else {
          setState("error");
          setMessage(data.error || "Something went wrong. Please try again.");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Network error. Please check your connection and try again.");
      });
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="bg-card text-card-foreground rounded-2xl shadow-card p-8 max-w-md w-full text-center space-y-4">
            <div className="text-4xl">❌</div>
            <h1 className="text-xl font-bold">Verification failed</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <a
              href="/"
              className="inline-block mt-2 py-2 px-6 rounded-full text-sm font-semibold text-amber-900 bg-amber-400 hover:bg-amber-500 transition-colors"
            >
              Back to home
            </a>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero banner — matches site style */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <Trash2 className="absolute -top-6 -left-6 w-48 h-48 opacity-[0.06] rotate-12" />
        <Recycle className="absolute -bottom-10 right-4 w-56 h-56 opacity-[0.06] -rotate-12" />

        <div className="relative max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="text-5xl">🎉</div>
          <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight">
            You're all set!
          </h1>
          <p className="text-lg opacity-90">
            Your email has been verified. We'll notify you as soon as Milwaukee Garbage Alerts goes live.
          </p>
          <div className="pt-2">
            <a
              href="/"
              className="inline-block py-3 px-8 rounded-full font-semibold text-amber-900 bg-amber-400 hover:bg-amber-500 transition-colors"
            >
              Back to home
            </a>
          </div>
        </div>
      </section>

      <div className="flex-1" />
      <SiteFooter />
    </div>
  );
}
