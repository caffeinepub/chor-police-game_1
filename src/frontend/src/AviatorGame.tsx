import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  Coins,
  Plane,
  RotateCcw,
  TrendingUp,
  Trophy,
} from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────
type GamePhase = "waiting" | "flying" | "crashed";

interface RoundResult {
  crashPoint: number;
}

interface LeaderEntry {
  name: string;
  balance: number;
  avatar: string;
}

// ── Constants ────────────────────────────────────────────────────────────────
const INITIAL_BALANCE = 1000;
const COUNTDOWN_SECS = 5;
const TICK_MS = 100;

const MOCK_LEADERS: LeaderEntry[] = [
  { name: "AceFlyer99", balance: 48320, avatar: "🦅" },
  { name: "Rocketman", balance: 31750, avatar: "🚀" },
  { name: "HighRoller", balance: 27900, avatar: "💎" },
  { name: "SkyKing", balance: 19450, avatar: "👑" },
  { name: "CashoutKing", balance: 14200, avatar: "💰" },
  { name: "LuckyPilot", balance: 11800, avatar: "🍀" },
  { name: "BetMaster", balance: 9650, avatar: "⚡" },
  { name: "CloudSurfer", balance: 7320, avatar: "☁️" },
];

// ── Crash point generator ────────────────────────────────────────────────────
function generateCrashPoint(): number {
  const r = Math.random();
  if (r < 0.3) return 1.0 + Math.random() * 0.9;
  const raw = Math.max(1.0, 0.99 / Math.random());
  return Math.min(raw, 100);
}

// ── Multiplier growth ────────────────────────────────────────────────────────
function multiplierAtTick(tick: number): number {
  return 1.0 + (tick * 0.028) ** 1.5;
}

// ── Plane position on curve ──────────────────────────────────────────────────
function planePosition(progress: number): {
  x: number;
  y: number;
  angle: number;
} {
  const t = Math.min(progress, 1);
  const p0 = { x: 8, y: 88 };
  const p1 = { x: 40, y: 55 };
  const p2 = { x: 90, y: 12 };
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
  const dt = 0.02;
  const t2 = Math.min(t + dt, 1);
  const x2 =
    (1 - t2) * (1 - t2) * p0.x + 2 * (1 - t2) * t2 * p1.x + t2 * t2 * p2.x;
  const y2 =
    (1 - t2) * (1 - t2) * p0.y + 2 * (1 - t2) * t2 * p1.y + t2 * t2 * p2.y;
  const angle = Math.atan2(-(y2 - y), x2 - x) * (180 / Math.PI);
  return { x, y, angle };
}

// ── Canvas draw ──────────────────────────────────────────────────────────────
function drawFlightPath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  crashed: boolean,
) {
  ctx.clearRect(0, 0, width, height);
  if (progress <= 0) return;

  const p0 = { x: width * 0.08, y: height * 0.88 };
  const p1 = { x: width * 0.4, y: height * 0.55 };
  const p2 = { x: width * 0.9, y: height * 0.12 };
  const steps = 60;
  const tMax = Math.min(progress, 1);

  const bezierX = (t: number) =>
    (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const bezierY = (t: number) =>
    (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;

  // Glow
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i <= steps; i++) {
    ctx.lineTo(bezierX((i / steps) * tMax), bezierY((i / steps) * tMax));
  }
  ctx.strokeStyle = crashed
    ? "oklch(55 0.25 25 / 0.25)"
    : "oklch(82 0.22 195 / 0.2)";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.stroke();

  // Main line
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i <= steps; i++) {
    ctx.lineTo(bezierX((i / steps) * tMax), bezierY((i / steps) * tMax));
  }
  ctx.strokeStyle = crashed
    ? "oklch(55 0.25 25 / 0.8)"
    : "oklch(82 0.22 195 / 0.8)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Fill
  const endX = bezierX(tMax);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i <= steps; i++) {
    ctx.lineTo(bezierX((i / steps) * tMax), bezierY((i / steps) * tMax));
  }
  ctx.lineTo(endX, height * 0.9);
  ctx.lineTo(p0.x, height * 0.9);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  if (crashed) {
    grad.addColorStop(0, "oklch(55 0.25 25 / 0.15)");
    grad.addColorStop(1, "oklch(55 0.25 25 / 0.02)");
  } else {
    grad.addColorStop(0, "oklch(82 0.22 195 / 0.12)");
    grad.addColorStop(1, "oklch(82 0.22 195 / 0.02)");
  }
  ctx.fillStyle = grad;
  ctx.fill();
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AviatorGame() {
  const [balance, setBalance] = useState<number>(() => {
    const saved = localStorage.getItem("aviator_balance");
    return saved ? Number.parseFloat(saved) : INITIAL_BALANCE;
  });

  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);

  const [betInput, setBetInput] = useState("50");
  const [autoInput, setAutoInput] = useState("");
  const [activeBet, setActiveBet] = useState<number | null>(null);
  const [cashedOutAt, setCashedOutAt] = useState<number | null>(null);

  const [history, setHistory] = useState<number[]>([]);
  const [roundLog, setRoundLog] = useState<RoundResult[]>([]);

  const [flashClass, setFlashClass] = useState("");
  const [winPopup, setWinPopup] = useState<string | null>(null);
  const [isPlaneExploding, setIsPlaneExploding] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef(0);
  const crashPointRef = useRef<number | null>(null);
  const activeBetRef = useRef<number | null>(null);
  const cashedOutRef = useRef<boolean>(false);
  const autoInputRef = useRef("");

  // Keep autoInputRef in sync
  useEffect(() => {
    autoInputRef.current = autoInput;
  }, [autoInput]);

  useEffect(() => {
    localStorage.setItem("aviator_balance", balance.toString());
  }, [balance]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const crashed = phase === "crashed";
    const progress = crashPoint
      ? Math.min((multiplier - 1) / Math.max(crashPoint - 1, 0.01), 1)
      : (multiplier - 1) / 10;
    drawFlightPath(ctx, canvas.width, canvas.height, progress, crashed);
  }, [multiplier, phase, crashPoint]);

  const startCountdown = useCallback(() => {
    setPhase("waiting");
    setCountdown(COUNTDOWN_SECS);
    tickRef.current = 0;
    setMultiplier(1.0);
    setCrashPoint(null);
    crashPointRef.current = null;
    setCashedOutAt(null);
    cashedOutRef.current = false;
    setActiveBet(null);
    activeBetRef.current = null;
    setIsPlaneExploding(false);
    setFlashClass("");
    setWinPopup(null);
  }, []);

  const handleCashout = useCallback((currentM?: number) => {
    if (cashedOutRef.current || activeBetRef.current === null) return;
    cashedOutRef.current = true;
    const m = currentM ?? multiplierAtTick(tickRef.current);
    const bet = activeBetRef.current;
    const winnings = Number.parseFloat((bet * m).toFixed(2));
    const profit = Number.parseFloat((winnings - bet).toFixed(2));
    setCashedOutAt(Number.parseFloat(m.toFixed(2)));
    setBalance((prev) => Number.parseFloat((prev + winnings - bet).toFixed(2)));
    activeBetRef.current = null;
    setActiveBet(null);
    setFlashClass("flash-win");
    setWinPopup(`+${profit} coins`);
    toast.success(`Cashed out at ${m.toFixed(2)}x — Won ${winnings} coins!`);
    setTimeout(() => setWinPopup(null), 1600);
  }, []);

  const startFlying = useCallback(() => {
    const cp = generateCrashPoint();
    setCrashPoint(cp);
    crashPointRef.current = cp;
    setPhase("flying");
    tickRef.current = 0;

    intervalRef.current = setInterval(() => {
      tickRef.current += 1;
      const m = multiplierAtTick(tickRef.current);
      setMultiplier(Number.parseFloat(m.toFixed(2)));

      // Auto-cashout via ref
      if (!cashedOutRef.current && activeBetRef.current !== null) {
        const autoVal = Number.parseFloat(autoInputRef.current);
        if (!Number.isNaN(autoVal) && autoVal > 1 && m >= autoVal) {
          handleCashout(m);
        }
      }

      // Crash check
      if (m >= (crashPointRef.current ?? 999)) {
        clearInterval(intervalRef.current!);
        const finalM = crashPointRef.current!;
        setMultiplier(finalM);
        setPhase("crashed");
        setIsPlaneExploding(true);
        setFlashClass("flash-crash");

        if (activeBetRef.current !== null && !cashedOutRef.current) {
          const lost = activeBetRef.current;
          setBalance((prev) => prev - lost);
          activeBetRef.current = null;
          setActiveBet(null);
          toast.error(`Crashed at ${finalM.toFixed(2)}x — Lost ${lost} coins`);
        }

        setHistory((prev) => [finalM, ...prev].slice(0, 20));
        setRoundLog((prev) => [{ crashPoint: finalM }, ...prev].slice(0, 50));

        setTimeout(() => startCountdown(), 3000);
      }
    }, TICK_MS);
  }, [startCountdown, handleCashout]);

  const placeBet = useCallback(() => {
    const bet = Number.parseFloat(betInput);
    if (Number.isNaN(bet) || bet <= 0) {
      toast.error("Enter a valid bet amount");
      return;
    }
    if (bet > balance) {
      toast.error("Insufficient balance");
      return;
    }
    activeBetRef.current = bet;
    setActiveBet(bet);
    cashedOutRef.current = false;
    toast.success(`Bet placed: ${bet} coins`);
  }, [betInput, balance]);

  // Countdown timer
  // biome-ignore lint/correctness/useExhaustiveDependencies: startFlying stable via ref pattern
  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          startFlying();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Boot
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional boot-once
  useEffect(() => {
    startCountdown();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const resetBalance = () => {
    setBalance(INITIAL_BALANCE);
    toast.success("Balance reset to 1000 coins");
  };

  const flyProgress =
    phase === "waiting"
      ? 0
      : crashPoint
        ? Math.min((multiplier - 1) / Math.max(crashPoint - 1, 0.01), 1)
        : 0;

  const planePos = planePosition(flyProgress);

  const multiplierColor =
    phase === "crashed"
      ? "text-destructive"
      : cashedOutAt
        ? "text-success"
        : "text-primary";

  const multiplierClass = `multiplier-display ${
    phase === "crashed" ? "crashed" : cashedOutAt ? "won" : ""
  }`;

  const currentWin =
    activeBet !== null && phase === "flying" && !cashedOutAt
      ? Number.parseFloat((activeBet * multiplier).toFixed(2))
      : null;

  const QUICK_BETS = [10, 50, 100, 500];

  return (
    <div
      className={`min-h-screen aviator-bg flex flex-col overflow-hidden relative ${flashClass}`}
      onAnimationEnd={() => setFlashClass("")}
      data-ocid="game.page"
    >
      <div className="absolute inset-0 grid-bg pointer-events-none opacity-40" />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
            <Plane className="w-4 h-4 text-primary" />
          </div>
          <h1 className="font-display text-lg font-bold text-foreground neon-text tracking-tight">
            AVIATOR
          </h1>
        </div>

        <div
          className="flex gap-1.5 overflow-hidden max-w-[45%]"
          data-ocid="game.panel"
        >
          {history.slice(0, 10).map((h, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: ordered history display
              key={i}
              className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                h >= 2
                  ? "history-badge-high"
                  : h >= 1.5
                    ? "history-badge-mid"
                    : "history-badge-low"
              }`}
            >
              {h.toFixed(2)}x
            </span>
          ))}
          {history.length === 0 && (
            <span className="text-xs text-muted-foreground">No rounds yet</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary" />
          <span
            className="font-display font-bold text-primary text-lg"
            data-ocid="game.panel"
          >
            {balance.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={resetBalance}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Reset balance"
            data-ocid="game.secondary_button"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Game canvas area ── */}
      <main className="relative flex-1 flex flex-col" style={{ minHeight: 0 }}>
        <div className="relative flex-1" style={{ minHeight: "280px" }}>
          <canvas
            ref={canvasRef}
            width={900}
            height={440}
            data-ocid="game.canvas_target"
            className="absolute inset-0 w-full h-full"
          />

          {phase !== "waiting" && (
            <div
              className={`absolute pointer-events-none ${
                isPlaneExploding ? "plane-explode" : ""
              }`}
              style={{
                left: `${planePos.x}%`,
                top: `${planePos.y}%`,
                transform: `translate(-50%, -50%) rotate(${-planePos.angle}deg)`,
                fontSize: "2.2rem",
                filter: isPlaneExploding
                  ? "drop-shadow(0 0 16px oklch(55 0.25 25))"
                  : "drop-shadow(0 0 12px oklch(82 0.22 195 / 0.9))",
              }}
            >
              {isPlaneExploding ? "💥" : "✈️"}
            </div>
          )}

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {phase === "waiting" ? (
              <div className="text-center">
                <p className="text-muted-foreground text-sm mb-2 tracking-widest uppercase font-bold">
                  Next round in
                </p>
                <div
                  className="font-display font-black text-7xl text-primary"
                  style={{ textShadow: "0 0 40px oklch(82 0.22 195 / 0.8)" }}
                >
                  {countdown}s
                </div>
                <p className="text-muted-foreground text-xs mt-2">
                  Place your bets now
                </p>
              </div>
            ) : (
              <div className="text-center">
                {phase === "crashed" && (
                  <p className="text-destructive text-sm font-bold mb-1 tracking-widest uppercase">
                    FLEW AWAY!
                  </p>
                )}
                {cashedOutAt && phase === "flying" && (
                  <p
                    className="text-sm font-bold mb-1 tracking-widest uppercase"
                    style={{ color: "oklch(80 0.22 145)" }}
                  >
                    CASHED OUT!
                  </p>
                )}
                <div
                  className={`${multiplierClass} ${multiplierColor} text-7xl md:text-8xl`}
                  data-ocid="game.panel"
                >
                  {multiplier.toFixed(2)}x
                </div>
                {cashedOutAt && (
                  <p
                    className="text-sm mt-1 font-semibold"
                    style={{ color: "oklch(80 0.22 145)" }}
                  >
                    @ {cashedOutAt.toFixed(2)}x
                  </p>
                )}
              </div>
            )}

            {winPopup && (
              <div
                className="win-popup absolute font-display font-black text-2xl pointer-events-none"
                style={{ color: "oklch(80 0.22 145)" }}
              >
                {winPopup}
              </div>
            )}
          </div>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-8 text-xs text-muted-foreground/40 pointer-events-none">
            <span>1.00x</span>
            <span>2.00x</span>
            <span>5.00x</span>
            <span>10.00x</span>
          </div>
        </div>

        {/* ── Bottom controls ── */}
        <div className="relative z-10 p-3 md:p-4">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Bet panel */}
            <div className="bet-panel rounded-xl p-4 md:col-span-2">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Bet Amount
                  </Label>
                  <div className="relative">
                    <Input
                      id="bet-input"
                      type="number"
                      min="1"
                      value={betInput}
                      onChange={(e) => setBetInput(e.target.value)}
                      disabled={phase !== "waiting" || activeBet !== null}
                      className="pr-12 bg-muted/60 border-border/60 text-foreground font-bold"
                      placeholder="50"
                      data-ocid="game.input"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      coins
                    </span>
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    {QUICK_BETS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setBetInput(v.toString())}
                        disabled={phase !== "waiting" || activeBet !== null}
                        className="text-xs px-2 py-0.5 rounded bg-muted/60 text-muted-foreground hover:text-primary hover:bg-primary/10 border border-border/40 transition-colors disabled:opacity-40"
                        data-ocid="game.secondary_button"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Auto Cashout (optional)
                  </Label>
                  <div className="relative">
                    <Input
                      id="auto-cashout-input"
                      type="number"
                      step="0.1"
                      min="1.1"
                      value={autoInput}
                      onChange={(e) => setAutoInput(e.target.value)}
                      className="pr-6 bg-muted/60 border-border/60 text-foreground font-bold"
                      placeholder="e.g. 2.00"
                      data-ocid="game.input"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      x
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/60 mt-1.5">
                    Auto cashout at this multiplier
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {phase === "waiting" && activeBet === null && (
                  <Button
                    onClick={placeBet}
                    className="flex-1 font-bold text-primary-foreground bg-primary hover:bg-primary/90 text-base h-12"
                    data-ocid="game.primary_button"
                  >
                    Place Bet — {betInput || "0"} coins
                  </Button>
                )}

                {phase === "waiting" && activeBet !== null && (
                  <div
                    className="flex-1 flex items-center justify-center h-12 rounded-lg border"
                    style={{
                      background: "oklch(80 0.22 145 / 0.1)",
                      borderColor: "oklch(80 0.22 145 / 0.3)",
                    }}
                  >
                    <span
                      className="font-bold"
                      style={{ color: "oklch(80 0.22 145)" }}
                    >
                      ✓ Bet placed: {activeBet} coins
                    </span>
                  </div>
                )}

                {phase === "flying" &&
                  activeBet !== null &&
                  cashedOutAt === null && (
                    <Button
                      onClick={() => handleCashout()}
                      className="flex-1 font-black text-base h-12 btn-cashout"
                      style={{
                        background: "oklch(80 0.22 145)",
                        color: "oklch(10 0.025 255)",
                      }}
                      data-ocid="game.primary_button"
                    >
                      CASHOUT — {currentWin} coins
                    </Button>
                  )}

                {phase === "flying" &&
                  (activeBet === null || cashedOutAt !== null) && (
                    <div className="flex-1 flex items-center justify-center h-12 rounded-lg bg-muted/40 border border-border/40">
                      <span className="text-muted-foreground text-sm">
                        {cashedOutAt
                          ? `Cashed at ${cashedOutAt.toFixed(2)}x ✓`
                          : "No bet this round"}
                      </span>
                    </div>
                  )}

                {phase === "crashed" && (
                  <div className="flex-1 flex items-center justify-center h-12 rounded-lg bg-destructive/10 border border-destructive/30">
                    <span className="text-destructive font-bold">
                      Crashed @ {crashPoint?.toFixed(2)}x
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="bet-panel rounded-xl p-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h3 className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                  Stats
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Balance
                    </span>
                    <span className="font-bold text-primary font-display">
                      {balance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Current Bet
                    </span>
                    <span className="font-bold text-foreground">
                      {activeBet ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Multiplier
                    </span>
                    <span
                      className={`font-bold font-display ${multiplierColor}`}
                    >
                      {phase === "waiting" ? "—" : `${multiplier.toFixed(2)}x`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Potential Win
                    </span>
                    <span
                      className="font-bold"
                      style={{ color: "oklch(80 0.22 145)" }}
                    >
                      {currentWin !== null ? `${currentWin}` : "—"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/30">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Rounds played</span>
                  <span>{history.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="max-w-4xl mx-auto mt-3">
            <Collapsible
              open={leaderboardOpen}
              onOpenChange={setLeaderboardOpen}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bet-panel text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  data-ocid="game.toggle"
                >
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-primary" />
                    <span>Leaderboard</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${leaderboardOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 bet-panel rounded-xl overflow-hidden">
                  <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border/30">
                    {MOCK_LEADERS.map((p, i) => (
                      <div
                        key={p.name}
                        className="flex items-center gap-3 p-3"
                        data-ocid={`leaderboard.item.${i + 1}`}
                      >
                        <span className="text-2xl">{p.avatar}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-xs font-bold ${
                                i === 0
                                  ? "text-yellow-400"
                                  : i === 1
                                    ? "text-slate-400"
                                    : i === 2
                                      ? "text-amber-600"
                                      : "text-muted-foreground"
                              }`}
                            >
                              #{i + 1}
                            </span>
                            <span className="text-sm font-semibold truncate">
                              {p.name}
                            </span>
                          </div>
                          <span className="text-xs text-primary font-bold">
                            {p.balance.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Round history */}
          {roundLog.length > 0 && (
            <div className="max-w-4xl mx-auto mt-2">
              <Collapsible open={showHistory} onOpenChange={setShowHistory}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bet-panel text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    data-ocid="game.toggle"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span>Round History</span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${showHistory ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1 bet-panel rounded-xl p-3">
                    <ScrollArea className="h-32">
                      <div className="flex flex-wrap gap-1.5">
                        {roundLog.map((r, i) => (
                          <span
                            // biome-ignore lint/suspicious/noArrayIndexKey: ordered history
                            key={i}
                            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              r.crashPoint >= 2
                                ? "history-badge-high"
                                : r.crashPoint >= 1.5
                                  ? "history-badge-mid"
                                  : "history-badge-low"
                            }`}
                            data-ocid={`history.item.${i + 1}`}
                          >
                            {r.crashPoint.toFixed(2)}x
                          </span>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 py-3 text-center text-xs text-muted-foreground/50 border-t border-border/20">
        © {new Date().getFullYear()}. Built with ❤️ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
          data-ocid="game.link"
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
