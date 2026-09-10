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
        PIN Superadmin
        <input
          className={styles.pinInput}
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          placeholder="••••••"
          aria-label="PIN Superadmin 6 digit"
          required
        />
      </label>
      {state.error && <div className={styles.error} role="alert">{state.error}</div>}
      <button type="submit" disabled={pending}>{pending ? "Memverifikasi PIN..." : "Masuk sebagai Superadmin"}</button>
    </form>
  );
}
