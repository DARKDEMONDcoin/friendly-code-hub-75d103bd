/** @doc Withdraw earned affiliate commission to PayPal or bank. */
// Withdraw — cartoon redesign.
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorMessage } from "@/lib/sanitizeError";
import {
  INK,
  YELLOW,
  MINT,
  PINK,
  LAVENDER,
  PEACH,
  PAGE_BG,
  SURFACE,
  SURFACE_2,
  BORDER,
  TEXT,
  MUTED,
} from "@/pages/billing/ReferralsPage";
import withdrawSticker from "@/assets/settings/withdraw-sticker.png";

const MIN_WITHDRAWAL = 10;
const WITHDRAWALS_PER_MONTH = 2;

interface PaymentMethod {
  id: string;
  method_type: string;
  label: string;
  instructions: string;
  status: "pending" | "approved" | "rejected";
  admin_note?: string | null;
  created_at: string;
}

const statusLabel = (s: string) =>
  (
    ({ approved: "Approved", pending: "Pending", rejected: "Rejected", paid: "Paid" }) as Record<
      string,
      string
    >
  )[s] ?? s;

const statusTone = (s: string) => {
  if (s === "approved" || s === "paid") return MINT;
  if (s === "rejected") return PINK;
  return YELLOW;
};

const WithdrawPage = () => {
  const navigate = useNavigate();

  const [available, setAvailable] = useState(0);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [usedThisMonth, setUsedThisMonth] = useState(0);

  const [amount, setAmount] = useState("");
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [address, setAddress] = useState("");
  const [submittingWd, setSubmittingWd] = useState(false);

  const [openMethod, setOpenMethod] = useState(false);
  const [newType, setNewType] = useState<"bank" | "custom">("bank");
  const [newLabel, setNewLabel] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [submittingMethod, setSubmittingMethod] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [earnsRes, wdsRes, methodsRes] = await Promise.all([
      supabase.from("referral_earnings").select("amount").eq("referrer_id", user.id),
      supabase
        .from("withdrawal_requests")
        .select("amount, status, created_at")
        .eq("user_id", user.id),
      supabase
        .from("user_payment_methods")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    const totalEarned = (earnsRes.data ?? []).reduce((s, r: any) => s + Number(r.amount), 0);
    const committed = (wdsRes.data ?? [])
      .filter((w: any) => w.status !== "rejected")
      .reduce((s, r: any) => s + Number(r.amount), 0);
    setAvailable(totalEarned - committed);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const used = (wdsRes.data ?? []).filter(
      (w: any) => w.status !== "rejected" && new Date(w.created_at) >= monthStart,
    ).length;
    setUsedThisMonth(used);
    setMethods((methodsRes.data ?? []) as PaymentMethod[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const callFlow = async (op: string, payload: Record<string, unknown>) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        "X-User-Flow": "1",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ op, ...payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  };

  const submitMethod = async () => {
    if (!newLabel.trim() || !newInstructions.trim()) {
      toast.error("Enter the method name and details");
      return;
    }
    setSubmittingMethod(true);
    try {
      await callFlow("submit_method", {
        method_type: newType,
        label: newLabel.trim(),
        instructions: newInstructions.trim(),
      });
      toast.success("Request sent for review.");
      setOpenMethod(false);
      setNewLabel("");
      setNewInstructions("");
      setNewType("bank");
      load();
    } catch (e: any) {
      toast.error(sanitizeErrorMessage(e, "Failed to send"));
    } finally {
      setSubmittingMethod(false);
    }
  };

  const submitWithdrawal = async () => {
    const amt = parseFloat(amount);
    if (!selectedMethodId) return toast.error("Select an approved payment method");
    if (!address.trim()) return toast.error("Enter a payout address");
    if (!Number.isFinite(amt) || amt < MIN_WITHDRAWAL)
      return toast.error(`Minimum withdrawal is $${MIN_WITHDRAWAL}`);
    if (amt > available) return toast.error("Insufficient balance");
    if (usedThisMonth >= WITHDRAWALS_PER_MONTH)
      return toast.error("Monthly withdrawal limit exceeded");
    setSubmittingWd(true);
    try {
      await callFlow("submit_withdrawal", {
        amount: amt,
        payment_method_id: selectedMethodId,
        payment_address: address.trim(),
      });
      toast.success("Withdrawal request sent.");
      setAmount("");
      setAddress("");
      setSelectedMethodId("");
      load();
    } catch (e: any) {
      toast.error(sanitizeErrorMessage(e, "Failed to send"));
    } finally {
      setSubmittingWd(false);
    }
  };

  const approvedMethods = methods.filter((m) => m.status === "approved");
  const remainingThisMonth = Math.max(WITHDRAWALS_PER_MONTH - usedThisMonth, 0);

  const field = "w-full px-4 py-3 rounded-2xl text-[14px] outline-none transition";
  const fieldStyle = {
    backgroundColor: SURFACE_2,
    border: `1.5px solid hsl(var(--surface-4))`,
    color: TEXT,
    fontWeight: 600,
  } as const;
  const labelStyle = { color: MUTED, fontWeight: 800 } as const;

  return (
    <div
      dir="ltr"
      className="relative min-h-[100dvh] overflow-y-auto"
      style={{ backgroundColor: PAGE_BG, color: TEXT }}
    >
      <header
        className="sticky top-0 z-20"
        style={{
          backgroundColor: `${PAGE_BG}E6`,
          backdropFilter: "saturate(160%) blur(18px)",
          WebkitBackdropFilter: "saturate(160%) blur(18px)",
          borderBottom: `1.5px solid ${BORDER}`,
        }}
      >
        <div className="max-w-lg mx-auto px-5 flex items-center justify-between py-3 safe-top">
          <button
            onClick={() => navigate("/settings/referrals")}
            className="grid h-10 w-10 place-items-center rounded-full active:translate-x-[1px] active:translate-y-[1px] transition"
            style={{ backgroundColor: SURFACE, border: `2px solid ${BORDER}`, color: TEXT }}
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <h1
            className="text-[17px]"
            style={{ fontWeight: 900, letterSpacing: "-0.02em", color: TEXT }}
          >
            Withdraw
          </h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-12 safe-bottom">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Hero balance */}
          <div
            className="mt-4 rounded-[28px] p-6 flex flex-col items-center text-center"
            style={{
              backgroundColor: PINK,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <img src={withdrawSticker} alt="" width={130} height={130} loading="lazy" />
            <p
              className="mt-2 text-[10px] uppercase tracking-[0.2em]"
              style={{ color: INK, fontWeight: 800, opacity: 0.7 }}
            >
              Available balance
            </p>
            <p
              className="text-[44px] leading-none mt-1"
              style={{ color: INK, fontWeight: 900, letterSpacing: "-0.03em" }}
            >
              ${available.toFixed(2)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <span
                className="px-3 py-1 rounded-full text-[11px]"
                style={{ background: INK, color: PINK, fontWeight: 800 }}
              >
                Min ${MIN_WITHDRAWAL}
              </span>
              <span
                className="px-3 py-1 rounded-full text-[11px]"
                style={{ background: INK, color: PINK, fontWeight: 800 }}
              >
                {remainingThisMonth}/{WITHDRAWALS_PER_MONTH} left this month
              </span>
            </div>
          </div>

          {/* Payment methods */}
          <section className="mt-5">
            <div className="mb-2 flex items-end justify-between px-2">
              <p className="text-[11px] uppercase tracking-[0.12em]" style={labelStyle}>
                Payment methods
              </p>
              <button
                onClick={() => setOpenMethod(true)}
                className="px-3 py-1.5 rounded-full text-[11px] flex items-center gap-1 active:translate-x-[1px] active:translate-y-[1px] transition"
                style={{
                  background: YELLOW,
                  color: INK,
                  border: `2px solid ${INK}`,
                  fontWeight: 800,
                }}
              >
                <Plus className="w-3 h-3" strokeWidth={3} /> Add
              </button>
            </div>
            <div
              className="rounded-[24px] overflow-hidden"
              style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
            >
              {methods.length === 0 ? (
                <p
                  className="p-8 text-center text-[13px]"
                  style={{ color: MUTED, fontWeight: 600 }}
                >
                  No payment methods added yet.
                </p>
              ) : (
                methods.map((m, i) => (
                  <div
                    key={m.id}
                    className="p-4 flex items-start justify-between gap-3"
                    style={{ borderTop: i === 0 ? "none" : `1px solid hsl(var(--surface-4))` }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px]" style={{ color: TEXT, fontWeight: 800 }}>
                          {m.label}
                        </p>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px]"
                          style={{ background: SURFACE_2, color: MUTED, fontWeight: 700 }}
                        >
                          {m.method_type === "bank" ? "Bank" : "Custom"}
                        </span>
                      </div>
                      <p
                        className="text-[12px] mt-1 line-clamp-2 whitespace-pre-line"
                        style={{ color: MUTED, fontWeight: 600 }}
                      >
                        {m.instructions}
                      </p>
                      {m.admin_note && (
                        <p className="text-[11px] mt-1" style={{ color: MUTED, opacity: 0.7 }}>
                          Admin: {m.admin_note}
                        </p>
                      )}
                    </div>
                    <span
                      className="shrink-0 px-2.5 py-1 rounded-full text-[10px]"
                      style={{
                        background: statusTone(m.status),
                        color: INK,
                        border: `1.5px solid ${INK}`,
                        fontWeight: 800,
                      }}
                    >
                      {statusLabel(m.status)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Withdraw form */}
          <section className="mt-5">
            <p className="text-[11px] uppercase tracking-[0.12em] mb-2 px-2" style={labelStyle}>
              New withdrawal
            </p>
            <div
              className="rounded-[24px] p-5 space-y-4"
              style={{ backgroundColor: SURFACE, border: `1.5px solid ${BORDER}` }}
            >
              <div>
                <label
                  className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
                  style={labelStyle}
                >
                  Method
                </label>
                {approvedMethods.length === 0 ? (
                  <p className="text-[12.5px]" style={{ color: MUTED, fontWeight: 600 }}>
                    No approved methods yet. Add one above.
                  </p>
                ) : (
                  <select
                    value={selectedMethodId}
                    onChange={(e) => setSelectedMethodId(e.target.value)}
                    className={field}
                    style={fieldStyle}
                  >
                    <option value="">Select method</option>
                    {approvedMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label
                  className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
                  style={labelStyle}
                >
                  Amount (USD)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={MIN_WITHDRAWAL}
                    max={available}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={MIN_WITHDRAWAL.toString()}
                    className={field}
                    style={fieldStyle}
                  />
                  <button
                    type="button"
                    disabled={available <= 0}
                    onClick={() => setAmount(available.toFixed(2))}
                    className="px-4 rounded-2xl text-[12px] disabled:opacity-40 active:translate-x-[1px] active:translate-y-[1px] transition"
                    style={{
                      background: YELLOW,
                      color: INK,
                      border: `2px solid ${INK}`,
                      fontWeight: 800,
                    }}
                  >
                    Max
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
                  style={labelStyle}
                >
                  Payout address
                </label>
                <textarea
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Account number, email, wallet address..."
                  className={`${field} resize-none`}
                  style={fieldStyle}
                />
                <p className="mt-1.5 text-[11px]" style={{ color: MUTED, fontWeight: 600 }}>
                  We ask every time to protect you from mistakes.
                </p>
              </div>

              <button
                onClick={submitWithdrawal}
                disabled={submittingWd || approvedMethods.length === 0 || remainingThisMonth === 0}
                className="w-full h-12 rounded-full text-[14px] active:translate-x-[1px] active:translate-y-[1px] transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: MINT,
                  color: INK,
                  border: `2.5px solid ${INK}`,
                  fontWeight: 900,
                  boxShadow: `3px 3px 0 ${INK}`,
                }}
              >
                {submittingWd && <Loader2 className="w-4 h-4 animate-spin" />}
                {submittingWd
                  ? "Sending…"
                  : remainingThisMonth === 0
                    ? "Monthly limit exceeded"
                    : "Submit request"}
              </button>
            </div>
          </section>
        </motion.div>
      </main>

      {/* Add method modal */}
      {openMethod && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 md:items-center"
          style={{ background: "#000000B0" }}
          onClick={() => setOpenMethod(false)}
        >
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-[28px] p-6"
            style={{
              backgroundColor: SURFACE,
              border: `2.5px solid ${INK}`,
              boxShadow: `4px 4px 0 ${INK}`,
            }}
          >
            <h3
              className="text-[20px]"
              style={{ color: TEXT, fontWeight: 900, letterSpacing: "-0.02em" }}
            >
              Add payment method
            </h3>
            <p className="mt-1 text-[12.5px]" style={{ color: MUTED, fontWeight: 600 }}>
              Your request will be reviewed before activation.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
                  style={labelStyle}
                >
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["bank", "custom"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setNewType(t)}
                      className="rounded-2xl px-4 py-3 text-[13px] transition active:translate-x-[1px] active:translate-y-[1px]"
                      style={{
                        background: newType === t ? LAVENDER : SURFACE_2,
                        color: newType === t ? INK : TEXT,
                        border: `2px solid ${newType === t ? INK : "hsl(var(--surface-4))"}`,
                        boxShadow: newType === t ? `2px 2px 0 ${INK}` : "none",
                        fontWeight: 800,
                      }}
                    >
                      {t === "bank" ? "Bank account" : "Custom"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
                  style={labelStyle}
                >
                  Method name
                </label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className={field}
                  style={fieldStyle}
                  placeholder={
                    newType === "bank" ? "My National Bank Account" : "Vodafone Cash / PayPal"
                  }
                />
              </div>

              <div>
                <label
                  className="text-[11px] uppercase tracking-[0.12em] mb-1.5 block"
                  style={labelStyle}
                >
                  Payout details
                </label>
                <textarea
                  rows={5}
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  className={`${field} resize-none`}
                  style={fieldStyle}
                  placeholder={
                    newType === "bank"
                      ? "Bank name, account number / IBAN, account holder name..."
                      : "Wallet number, service name, phone number..."
                  }
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setOpenMethod(false)}
                className="flex-1 h-12 rounded-full text-[13px] transition"
                style={{
                  background: SURFACE_2,
                  color: TEXT,
                  border: `2px solid ${BORDER}`,
                  fontWeight: 800,
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitMethod}
                disabled={submittingMethod}
                className="flex-1 h-12 rounded-full text-[13px] active:translate-x-[1px] active:translate-y-[1px] transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: MINT,
                  color: INK,
                  border: `2.5px solid ${INK}`,
                  fontWeight: 900,
                  boxShadow: `3px 3px 0 ${INK}`,
                }}
              >
                {submittingMethod && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default WithdrawPage;
