"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/dashboard/login/actions";
import styles from "./LoginForm.module.css";

const initialState: LoginState = { error: "" };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form className={`login-form ${styles.form}`} action={formAction}>
      <label>
        Email
        <input name="email" type="email" placeholder="nama@etos.id" autoComplete="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" placeholder="••••••••" autoComplete="current-password" minLength={6} required />
      </label>
      {state.error && <div className={styles.error} role="alert">{state.error}</div>}
      <button type="submit" disabled={pending}>{pending ? "Memverifikasi..." : "Masuk ke Dashboard"}</button>
    </form>
  );
}
