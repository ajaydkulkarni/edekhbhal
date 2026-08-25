"use client";

import { useState } from "react";
import Link from "next/link";

export default function Register() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const r = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const text = await r.text();
      let payload: { error?: string; message?: string; devLink?: string } = {};

      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server returned an unexpected response (${r.status}).`);
      }

      if (!r.ok) {
        throw new Error(payload.error || `Request failed with status ${r.status}.`);
      }

      setMessage(
        `${payload.message ?? "Authentication link created."}` +
        (payload.devLink ? ` Development link: ${payload.devLink}` : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send authentication link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 520, margin: "60px auto" }}>
        <h1>Register</h1>
        <p className="muted">Enter your email. eDekhbhal will create a secure authentication link.</p>

        <form onSubmit={submit}>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />

          <div style={{ marginTop: 18 }}>
            <button className="button" type="submit" disabled={submitting}>
              {submitting ? "Creating authentication link..." : "Send authentication link"}
            </button>
          </div>
        </form>

        {error && <p className="error" style={{ marginTop: 16 }}>{error}</p>}
        {message && <p className="success" style={{ marginTop: 16, overflowWrap: "anywhere" }}>{message}</p>}

        <p className="muted">
          Already registered? <Link href="/login">Login</Link>
        </p>
      </div>
    </main>
  );
}
