import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
          setMessage(data.message || "Email verified!");
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="bg-card text-card-foreground rounded-2xl shadow-card p-8 max-w-md w-full text-center space-y-4">
          {state === "loading" && (
            <>
              <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Verifying your email…</p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="text-4xl">✅</div>
              <h1 className="text-xl font-bold">Email verified!</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
              <a
                href="/"
                className="inline-block mt-2 py-2 px-6 rounded-full text-sm font-semibold text-amber-900 bg-amber-400 hover:bg-amber-500 transition-colors"
              >
                Back to home
              </a>
            </>
          )}

          {state === "error" && (
            <>
              <div className="text-4xl">❌</div>
              <h1 className="text-xl font-bold">Verification failed</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
              <a
                href="/"
                className="inline-block mt-2 py-2 px-6 rounded-full text-sm font-semibold text-amber-900 bg-amber-400 hover:bg-amber-500 transition-colors"
              >
                Back to home
              </a>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
