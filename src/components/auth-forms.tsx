"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button, InlineAlert, TextField, StatusBadge } from "@/components/ui";

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch("/api/v1/auth/csrf", { cache: "no-store", credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok || typeof body?.data?.csrfToken !== "string") {
    throw new Error("Security verification could not be initialized. Refresh and try again.");
  }
  return body.data.csrfToken;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Sign-in failed. Check your credentials and try again.");
      setPassword("");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="login-title">
      <div className="auth-card__brand">
        <span className="brand-mark">FX</span>
        <span><strong>falchion<span>.</span></strong><small>FINANCE WORKSPACE</small></span>
      </div>
      <StatusBadge tone="info" icon="lock">Private workspace</StatusBadge>
      <h1 id="login-title">Welcome back.</h1>
      <p className="auth-card__description">Sign in with your invited work account to continue.</p>
      {error ? <InlineAlert tone="danger" title="Sign-in was not completed">{error}</InlineAlert> : null}
      <form className="auth-form" onSubmit={submit}>
        <TextField
          id="login-email"
          label="Work email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
          maxLength={320}
          placeholder="you@company.com"
        />
        <div className="auth-password-field">
          <TextField
            id="login-password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            maxLength={256}
            placeholder="Enter your password"
          />
          <button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
            <Icon name={showPassword ? "eye-off" : "eye"} size={17} />
          </button>
        </div>
        <Button type="submit" size="lg" disabled={busy} className="auth-submit">
          {busy ? <><span className="button-spinner" aria-hidden="true" /> Signing in…</> : <>Sign in <Icon name="arrow-up-right" size={17} /></>}
        </Button>
      </form>
      <p className="auth-card__fineprint"><Icon name="shield" size={15} /> Sessions expire after inactivity and can be revoked by an administrator.</p>
      <p className="auth-card__footnote">Have an invitation? <Link href="/activate">Activate your account</Link></p>
    </section>
  );
}

export function ActivateForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? "" : "This activation link does not contain a valid invitation token.");
  const [activated, setActivated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (token && window.location.search) {
      window.history.replaceState({}, document.title, "/activate");
    }
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This activation link is incomplete. Ask your administrator for a new invitation.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError("Use a password between 12 and 128 characters.");
      return;
    }
    setBusy(true);
    try {
      const csrfToken = await fetchCsrfToken();
      const response = await fetch("/api/v1/auth/activate", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Account activation failed.");
      setPassword("");
      setConfirmPassword("");
      setActivated(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account activation failed. Ask your administrator for help.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="activate-title">
      <div className="auth-card__brand">
        <span className="brand-mark">FX</span>
        <span><strong>falchion<span>.</span></strong><small>FINANCE WORKSPACE</small></span>
      </div>
      <StatusBadge tone="info" icon="shield">Invitation activation</StatusBadge>
      {activated ? (
        <div className="auth-success">
          <span className="auth-success__icon"><Icon name="check" size={25} /></span>
          <h1 id="activate-title">You’re all set.</h1>
          <p>Your account is active. Sign in to open your workspace.</p>
          <Button size="lg" onClick={() => router.replace("/login")} className="auth-submit">Continue to sign in <Icon name="arrow-up-right" size={17} /></Button>
        </div>
      ) : (
        <>
          <h1 id="activate-title">Set up your account.</h1>
          <p className="auth-card__description">Choose a strong password to activate your invited account.</p>
          {error ? <InlineAlert tone="danger" title="Activation was not completed">{error}</InlineAlert> : null}
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-password-field">
              <TextField
                id="activate-password"
                label="New password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
                minLength={12}
                maxLength={128}
                hint="Use at least 12 characters. A phrase is fine."
              />
              <button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                <Icon name={showPassword ? "close" : "overview"} size={17} />
              </button>
            </div>
            <TextField
              id="activate-confirm-password"
              label="Confirm password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              required
              minLength={12}
              maxLength={128}
            />
            <Button type="submit" size="lg" disabled={busy || !token} className="auth-submit">
              {busy ? <><span className="button-spinner" aria-hidden="true" /> Activating…</> : <>Activate account <Icon name="arrow-up-right" size={17} /></>}
            </Button>
          </form>
        </>
      )}
      <p className="auth-card__footnote"><Link href="/login">Return to sign in</Link></p>
    </section>
  );
}
