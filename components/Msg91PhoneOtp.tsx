"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

declare global {
  interface Window {
    initSendOTP?: (configuration: Record<string, unknown>) => void;
    sendOtp?: (identifier: string, success?: (data: any) => void, failure?: (error: any) => void) => void;
    verifyOtp?: (otp: string, success?: (data: any) => void, failure?: (error: any) => void, reqId?: string) => void;
  }
}

type Props = {
  accountType: "customer" | "partner";
  onAuthenticated?: (phone: string) => void;
  compact?: boolean;
};

const WIDGET_ID = "366b746f4e41323031343938";

export default function Msg91PhoneOtp({ accountType, onAuthenticated, compact = false }: Props) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [requestId, setRequestId] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const tokenAuth = process.env.NEXT_PUBLIC_MSG91_WIDGET_TOKEN;
    if (!tokenAuth) {
      setMessage("OTP service is not configured. Please contact YREL Support.");
      return;
    }

    let cancelled = false;
    const initialize = () => {
      if (cancelled || !window.initSendOTP) return;
      try {
        window.initSendOTP({
          widgetId: WIDGET_ID,
          tokenAuth,
          exposeMethods: true,
          success: () => undefined,
          failure: () => undefined
        });
        setReady(true);
      } catch {
        setMessage("Unable to load WhatsApp OTP. Please refresh and try again.");
      }
    };

    if (window.initSendOTP) {
      initialize();
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-yrel-msg91="true"]');
      if (existing) {
        existing.addEventListener("load", initialize, { once: true });
        existing.addEventListener("error", () => setMessage("Unable to load WhatsApp OTP."), { once: true });
      } else {
        const script = document.createElement("script");
        script.src = "https://verify.msg91.com/otp-provider.js";
        script.async = true;
        script.dataset.yrelMsg91 = "true";
        script.onload = initialize;
        script.onerror = () => setMessage("Unable to load WhatsApp OTP. Please refresh and try again.");
        document.head.appendChild(script);
      }
    }
    return () => { cancelled = true; };
  }, []);

  const digits = phone.replace(/\D/g, "").slice(0, 10);

  function sendCode() {
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setMessage("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!ready || !window.sendOtp) {
      setMessage("WhatsApp OTP is still loading. Please wait a moment.");
      return;
    }
    setBusy(true);
    setMessage("");
    window.sendOtp("91" + digits, (data) => {
      const id = typeof data?.message === "string" ? data.message : data?.reqId;
      if (!id || typeof id !== "string") {
        setMessage("MSG91 did not return an OTP request ID. Please try again.");
      } else {
        setRequestId(id);
        setMessage("6-digit OTP sent to your WhatsApp number.");
      }
      setBusy(false);
    }, () => {
      setMessage("Could not send WhatsApp OTP. Check the number and try again.");
      setBusy(false);
    });
  }

  function verifyCode() {
    if (!requestId || !/^\d{6}$/.test(otp)) {
      setMessage("Enter the 6-digit OTP sent to WhatsApp.");
      return;
    }
    if (!window.verifyOtp) {
      setMessage("OTP verification is not ready. Please refresh and try again.");
      return;
    }
    setBusy(true);
    setMessage("");
    window.verifyOtp(otp, async (data) => {
      const accessToken = typeof data?.message === "string" ? data.message : data?.accessToken;
      if (!accessToken || typeof accessToken !== "string") {
        setBusy(false);
        setMessage("MSG91 did not return a verification token. Please request a new OTP.");
        return;
      }
      try {
        const response = await fetch("/api/auth/msg91/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, phone: digits, accountType }),
          cache: "no-store"
        });
        const result = await response.json();
        if (!response.ok || !result.tokenHash) {
          throw new Error(result.error || "Could not complete secure login.");
        }
        const { error } = await supabase.auth.verifyOtp({
          token_hash: result.tokenHash,
          type: "magiclink"
        });
        if (error) throw error;
        setMessage("Verified successfully.");
        onAuthenticated?.("+" + "91" + digits);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Login failed. Please try again.");
      } finally {
        setBusy(false);
      }
    }, () => {
      setBusy(false);
      setMessage("Incorrect or expired OTP. Please try again.");
    }, requestId);
  }

  return (
    <div className={compact ? "yrel-msg91-otp compact" : "yrel-msg91-otp"}>
      <label className="wide-field">
        <span>{compact ? "Mobile number" : "Enter your 10-digit mobile number"}</span>
        <div className="location-input">
          <span>+91</span>
          <input
            className="phone-number-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="Enter mobile number"
            disabled={busy || Boolean(requestId)}
          />
        </div>
      </label>
      {!requestId ? (
        <button className="book-button full" type="button" onClick={sendCode} disabled={busy || !ready}>
          {busy ? "Sending OTP…" : "Continue with WhatsApp OTP"}
        </button>
      ) : (
        <>
          <label className="wide-field">
            <span>Enter 6-digit WhatsApp OTP</span>
            <input
              className="email-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit OTP"
              disabled={busy}
            />
          </label>
          <button className="book-button full" type="button" onClick={verifyCode} disabled={busy || otp.length !== 6}>
            {busy ? "Verifying…" : "Verify & Login"}
          </button>
          <button className="profile-signout-button" type="button" disabled={busy} onClick={() => { setRequestId(""); setOtp(""); setMessage(""); }}>
            Change mobile number
          </button>
        </>
      )}
      {message && <div className="notice" role="status">{message}</div>}
    </div>
  );
}
