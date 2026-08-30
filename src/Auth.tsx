import { useState } from "react";
import type { FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

function SignInForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
    } catch {
      setError(
        flow === "signIn"
          ? "Couldn't sign in — check your email and password."
          : "Couldn't create an account — that email may already be in use.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img src="/logo.svg" alt="" className="auth-logo" width="44" height="44" />
        <h1>Sift</h1>
        <p className="auth-pitch">
          You applied to 40 jobs. Every alert email is 30 links of noise.
        </p>
        <p className="app-tagline">
          Forward it. Every link gets scraped, scored against what you actually want, and
          batched into one ranked email. Reply "skip #2" to steer the next one.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Email
            <input
              className="auth-input"
              type="email"
              name="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="auth-label">
            Password
            <input
              className="auth-input"
              type="password"
              name="password"
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="provision-button auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Please wait…" : flow === "signIn" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setFlow(flow === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
        >
          {flow === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

export default SignInForm;
