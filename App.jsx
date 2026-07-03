import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Lock, X, Check, ChevronLeft, ChevronRight, Scissors, Settings, Trash2, Loader2 } from "lucide-react";
import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, runTransaction,
} from "firebase/firestore";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const DEFAULT_SETTINGS = {
  adminPassword: "admin123",
  days: [
    { enabled: false, morning: true, afternoon: true }, // Domingo
    { enabled: true, morning: true, afternoon: true },  // Segunda
    { enabled: true, morning: true, afternoon: true },  // Terça
    { enabled: true, morning: true, afternoon: true },  // Quarta
    { enabled: true, morning: true, afternoon: true },  // Quinta
    { enabled: true, morning: true, afternoon: true },  // Sexta
    { enabled: true, morning: true, afternoon: true },  // Sábado
  ],
};

const SETTINGS_REF = doc(db, "salon", "settings");
const BOOKINGS_COL = collection(db, "bookings");

function genSlots(start, end) {
  const slots = [];
  let [h, m] = start;
  const [eh, em] = end;
  while (h < eh || (h === eh && m < em)) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m -= 60; h += 1; }
  }
  return slots;
}
const MORNING_SLOTS = genSlots([7, 0], [11, 0]);
const AFTERNOON_SLOTS = genSlots([12, 0], [17, 30]);

function fmtDateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDatePretty(d) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [status, setStatus] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [savingBooking, setSavingBooking] = useState(false);
  const [adminTab, setAdminTab] = useState("bookings");

  // Live sync with Firestore: settings
  useEffect(() => {
    let initialized = false;
    const unsub = onSnapshot(
      SETTINGS_REF,
      async (snap) => {
        if (snap.exists()) {
          setSettings(snap.data());
        } else if (!initialized) {
          initialized = true;
          await setDoc(SETTINGS_REF, DEFAULT_SETTINGS);
        }
        setLoading(false);
      },
      (err) => { console.error(err); setConnError(true); setLoading(false); }
    );
    return () => unsub();
  }, []);

  // Live sync with Firestore: bookings
  useEffect(() => {
    const unsub = onSnapshot(
      BOOKINGS_COL,
      (snap) => setBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error(err); setConnError(true); }
    );
    return () => unsub();
  }, []);

  const saveSettings = async (next) => {
    try { await setDoc(SETTINGS_REF, next); }
    catch (e) { setStatus({ type: "error", msg: "Não foi possível salvar as configurações." }); }
  };

  const visibleDays = useMemo(() => {
    const out = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + weekOffset * 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push(d);
    }
    return out;
  }, [weekOffset]);

  const isDayEnabled = (d) => settings.days[d.getDay()]?.enabled;

  const takenTimes = useMemo(() => {
    if (!selectedDate) return new Set();
    const key = fmtDateKey(selectedDate);
    return new Set(bookings.filter(b => b.date === key && b.status !== "cancelado").map(b => b.time));
  }, [bookings, selectedDate]);

  const dayConf = selectedDate ? settings.days[selectedDate.getDay()] : null;
  const availableSlots = useMemo(() => {
    if (!dayConf) return [];
    let s = [];
    if (dayConf.morning) s = s.concat(MORNING_SLOTS);
    if (dayConf.afternoon) s = s.concat(AFTERNOON_SLOTS);
    return s;
  }, [dayConf]);

  const isPastSlot = (d, time) => {
    const now = new Date();
    const [h, m] = time.split(":").map(Number);
    const slotDt = new Date(d);
    slotDt.setHours(h, m, 0, 0);
    return slotDt < now;
  };

  const handleConfirmBooking = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setStatus({ type: "error", msg: "Preencha nome e telefone." });
      return;
    }
    setSavingBooking(true);
    const key = fmtDateKey(selectedDate);
    const slotId = `${key}_${selectedTime}`;
    const slotRef = doc(db, "bookings", slotId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(slotRef);
        if (snap.exists() && snap.data().status !== "cancelado") {
          throw new Error("CONFLICT");
        }
        tx.set(slotRef, {
          date: key,
          time: selectedTime,
          name: form.name.trim(),
          phone: form.phone.trim(),
          status: "confirmado",
          createdAt: new Date().toISOString(),
        });
      });
      setStatus({ type: "success", msg: `Reserva confirmada para ${fmtDatePretty(selectedDate)} às ${selectedTime}.` });
      setForm({ name: "", phone: "" });
      setSelectedTime(null);
    } catch (e) {
      if (e.message === "CONFLICT") {
        setStatus({ type: "error", msg: "Esse horário acabou de ser reservado. Escolha outro." });
        setSelectedTime(null);
      } else {
        setStatus({ type: "error", msg: "Não foi possível confirmar. Verifique sua internet e tente de novo." });
      }
    }
    setSavingBooking(false);
  };

  const handleAdminLogin = () => {
    if (pwInput === settings.adminPassword) {
      setAdminAuthed(true);
      setPwError("");
      setPwInput("");
    } else {
      setPwError("Senha incorreta.");
    }
  };

  const cancelBooking = async (id) => {
    try { await updateDoc(doc(db, "bookings", id), { status: "cancelado" }); }
    catch (e) { setStatus({ type: "error", msg: "Não foi possível cancelar." }); }
  };

  const deleteBooking = async (id) => {
    try { await deleteDoc(doc(db, "bookings", id)); }
    catch (e) { setStatus({ type: "error", msg: "Não foi possível excluir." }); }
  };

  const toggleDay = (idx, field) => {
    const next = { ...settings, days: settings.days.map((d, i) => i === idx ? { ...d, [field]: !d[field] } : d) };
    saveSettings(next);
  };

  const upcomingBookings = useMemo(() => {
    const todayKey = fmtDateKey(new Date());
    return bookings
      .filter(b => b.status !== "cancelado" && b.date >= todayKey)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [bookings]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5]">
        <Loader2 className="w-6 h-6 animate-spin text-[#1a1a1a]" />
      </div>
    );
  }

  if (connError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5] px-6 text-center">
        <div>
          <p className="font-black text-lg mb-2">Não foi possível conectar ao banco de dados</p>
          <p className="text-sm text-[#666]">Confira se as chaves do Firebase em <code>src/firebase.js</code> foram preenchidas corretamente e se o Firestore está ativado no console do Firebase.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#111111]" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <header className="border-b-2 border-[#111111] bg-white sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-0.5 select-none">
            <span className="text-2xl font-black tracking-tight">JUSTIZ</span>
            <span className="text-2xl font-black text-[#1E9BE0]">&amp;</span>
            <span className="text-2xl font-black tracking-tight">CO</span>
          </div>
          <button
            onClick={() => { setShowAdmin(true); setAdminAuthed(false); setPwInput(""); setPwError(""); }}
            className="p-2 rounded-full hover:bg-[#F0F0EE] transition-colors"
            aria-label="Área administrativa"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        <div className="mb-8">
          <p className="text-[11px] font-bold tracking-[0.15em] text-[#1E9BE0] uppercase mb-1">Agendamento online</p>
          <h1 className="text-3xl font-black leading-tight">Reserve seu horário</h1>
          <p className="text-sm text-[#666] mt-1">Escolha o dia e o horário disponível abaixo.</p>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wide text-[#666]">Dias disponíveis</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
              disabled={weekOffset === 0}
              className="p-1.5 rounded-full border border-[#DDD] disabled:opacity-30 hover:bg-[#F0F0EE]"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="p-1.5 rounded-full border border-[#DDD] hover:bg-[#F0F0EE]"
              aria-label="Próxima semana"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-8">
          {visibleDays.map((d, i) => {
            const enabled = isDayEnabled(d);
            const isSelected = selectedDate && fmtDateKey(selectedDate) === fmtDateKey(d);
            const isToday = fmtDateKey(d) === fmtDateKey(new Date());
            return (
              <button
                key={i}
                disabled={!enabled}
                onClick={() => { setSelectedDate(d); setSelectedTime(null); setStatus(null); }}
                className={`flex flex-col items-center py-2.5 rounded-xl border transition-all
                  ${!enabled ? "opacity-25 cursor-not-allowed border-transparent" : "cursor-pointer"}
                  ${isSelected ? "bg-[#111111] border-[#111111] text-white" : "bg-white border-[#E5E5E3] hover:border-[#111111]"}
                `}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide">{WEEKDAYS_SHORT[d.getDay()]}</span>
                <span className={`text-lg font-black ${isToday && !isSelected ? "text-[#1E9BE0]" : ""}`}>{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {selectedDate && dayConf && (
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-wide text-[#666] mb-3">
              Horários — {fmtDatePretty(selectedDate)}
            </p>
            {!dayConf.morning && !dayConf.afternoon && (
              <p className="text-sm text-[#999] italic">Nenhum horário disponível neste dia.</p>
            )}
            {dayConf.morning && (
              <div className="mb-4">
                <p className="text-[11px] font-bold text-[#999] mb-2">MANHÃ · 7:00 – 11:00</p>
                <div className="grid grid-cols-4 gap-2">
                  {MORNING_SLOTS.map(t => {
                    const taken = takenTimes.has(t);
                    const past = isPastSlot(selectedDate, t);
                    const disabled = taken || past;
                    const isSel = selectedTime === t;
                    return (
                      <button
                        key={t}
                        disabled={disabled}
                        onClick={() => { setSelectedTime(t); setStatus(null); }}
                        className={`py-2 rounded-lg text-sm font-bold border transition-colors
                          ${disabled ? "bg-[#F0F0EE] text-[#BBB] border-transparent cursor-not-allowed line-through" : "bg-white border-[#E5E5E3] hover:border-[#1E9BE0]"}
                          ${isSel ? "!bg-[#1E9BE0] !border-[#1E9BE0] text-white" : ""}
                        `}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {dayConf.afternoon && (
              <div>
                <p className="text-[11px] font-bold text-[#999] mb-2">TARDE · 12:00 – 17:30</p>
                <div className="grid grid-cols-4 gap-2">
                  {AFTERNOON_SLOTS.map(t => {
                    const taken = takenTimes.has(t);
                    const past = isPastSlot(selectedDate, t);
                    const disabled = taken || past;
                    const isSel = selectedTime === t;
                    return (
                      <button
                        key={t}
                        disabled={disabled}
                        onClick={() => { setSelectedTime(t); setStatus(null); }}
                        className={`py-2 rounded-lg text-sm font-bold border transition-colors
                          ${disabled ? "bg-[#F0F0EE] text-[#BBB] border-transparent cursor-not-allowed line-through" : "bg-white border-[#E5E5E3] hover:border-[#1E9BE0]"}
                          ${isSel ? "!bg-[#1E9BE0] !border-[#1E9BE0] text-white" : ""}
                        `}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedDate && selectedTime && (
          <div className="border-2 border-[#111111] rounded-2xl p-5 bg-white mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Scissors className="w-4 h-4 text-[#1E9BE0]" />
              <p className="text-sm font-bold">
                {fmtDatePretty(selectedDate)} às {selectedTime}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#666]">Nome</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Seu nome completo"
                  className="w-full mt-1 px-3 py-2.5 rounded-lg border border-[#DDD] focus:outline-none focus:ring-2 focus:ring-[#1E9BE0] text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#666]">Telefone / WhatsApp</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="w-full mt-1 px-3 py-2.5 rounded-lg border border-[#DDD] focus:outline-none focus:ring-2 focus:ring-[#1E9BE0] text-sm"
                />
              </div>
              <button
                onClick={handleConfirmBooking}
                disabled={savingBooking}
                className="w-full py-3 rounded-lg bg-[#111111] text-white font-bold text-sm hover:bg-[#1E9BE0] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingBooking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar reserva
              </button>
              <p className="text-[11px] text-[#999] text-center">Só o administrador pode cancelar sua reserva.</p>
            </div>
          </div>
        )}

        {status && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium mb-8 ${status.type === "success" ? "bg-[#E8F6EE] text-[#1E7A45]" : "bg-[#FCEAEA] text-[#B3261E]"}`}>
            {status.msg}
          </div>
        )}

        <footer className="text-center text-[11px] text-[#AAA] pt-6 border-t border-[#EEE]">
          Justiz &amp; Co — agendamento online
        </footer>
      </main>

      {showAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowAdmin(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEE]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span className="font-black">Área administrativa</span>
              </div>
              <button onClick={() => setShowAdmin(false)} className="p-1 rounded-full hover:bg-[#F0F0EE]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!adminAuthed ? (
              <div className="p-6">
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#666]">Senha de administrador</label>
                <input
                  type="password"
                  value={pwInput}
                  onChange={e => setPwInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdminLogin()}
                  className="w-full mt-1 px-3 py-2.5 rounded-lg border border-[#DDD] focus:outline-none focus:ring-2 focus:ring-[#1E9BE0] text-sm"
                  autoFocus
                />
                {pwError && <p className="text-xs text-[#B3261E] mt-2">{pwError}</p>}
                <button
                  onClick={handleAdminLogin}
                  className="w-full mt-4 py-2.5 rounded-lg bg-[#111111] text-white font-bold text-sm hover:bg-[#1E9BE0] transition-colors"
                >
                  Entrar
                </button>
              </div>
            ) : (
              <>
                <div className="flex border-b border-[#EEE] px-5">
                  {["bookings", "days", "password"].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setAdminTab(tab)}
                      className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 -mb-px ${adminTab === tab ? "border-[#1E9BE0] text-[#111111]" : "border-transparent text-[#999]"}`}
                    >
                      {tab === "bookings" ? "Reservas" : tab === "days" ? "Dias e horários" : "Senha"}
                    </button>
                  ))}
                </div>

                <div className="overflow-y-auto p-5">
                  {adminTab === "bookings" && (
                    <div className="space-y-2">
                      {upcomingBookings.length === 0 && (
                        <p className="text-sm text-[#999] italic">Nenhuma reserva futura.</p>
                      )}
                      {upcomingBookings.map(b => (
                        <div key={b.id} className="flex items-center justify-between border border-[#EEE] rounded-lg px-3 py-2.5">
                          <div>
                            <p className="text-sm font-bold">{b.name}</p>
                            <p className="text-xs text-[#666]">{b.date.split("-").reverse().join("/")} às {b.time} · {b.phone}</p>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => cancelBooking(b.id)}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-md bg-[#FCEAEA] text-[#B3261E] hover:bg-[#F8D5D5]"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => deleteBooking(b.id)}
                              className="p-1.5 rounded-md hover:bg-[#F0F0EE]"
                              aria-label="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#999]" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {adminTab === "days" && (
                    <div className="space-y-2">
                      <p className="text-xs text-[#999] mb-2">Ative os dias e blocos de horário em que o salão atende.</p>
                      {settings.days.map((d, idx) => (
                        <div key={idx} className="flex items-center justify-between border border-[#EEE] rounded-lg px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={d.enabled} onChange={() => toggleDay(idx, "enabled")} className="w-4 h-4 accent-[#111111]" />
                            <span className="text-sm font-bold w-20">{WEEKDAYS[idx]}</span>
                          </div>
                          <div className="flex gap-3 text-xs">
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={d.morning} disabled={!d.enabled} onChange={() => toggleDay(idx, "morning")} className="w-3.5 h-3.5 accent-[#1E9BE0]" />
                              Manhã
                            </label>
                            <label className="flex items-center gap-1">
                              <input type="checkbox" checked={d.afternoon} disabled={!d.enabled} onChange={() => toggleDay(idx, "afternoon")} className="w-3.5 h-3.5 accent-[#1E9BE0]" />
                              Tarde
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {adminTab === "password" && (
                    <ChangePassword settings={settings} saveSettings={saveSettings} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChangePassword({ settings, saveSettings }) {
  const [np, setNp] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");

  const save = () => {
    if (np.length < 4) { setMsg("Use ao menos 4 caracteres."); return; }
    if (np !== confirm) { setMsg("As senhas não coincidem."); return; }
    saveSettings({ ...settings, adminPassword: np });
    setMsg("Senha atualizada.");
    setNp(""); setConfirm("");
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-[#666]">Nova senha</label>
        <input type="password" value={np} onChange={e => setNp(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-[#DDD] text-sm focus:outline-none focus:ring-2 focus:ring-[#1E9BE0]" />
      </div>
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wide text-[#666]">Confirmar senha</label>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-[#DDD] text-sm focus:outline-none focus:ring-2 focus:ring-[#1E9BE0]" />
      </div>
      {msg && <p className="text-xs text-[#666]">{msg}</p>}
      <button onClick={save} className="w-full py-2.5 rounded-lg bg-[#111111] text-white font-bold text-sm hover:bg-[#1E9BE0] transition-colors">
        Salvar senha
      </button>
    </div>
  );
}
