"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { City } from "./components/city";
import { City3D } from "./components/city3d";
import { NotesPanel } from "./components/notes";
import { Hum } from "./lib/hum";
import { layout, contentWidth } from "./lib/city/layout";
import { planCity } from "./lib/city/plan";
import { demoMetrics, loadCityMetrics, dateOf } from "./lib/city/metrics";
import type { NoteMetric } from "./lib/city/metrics";
import { ObsidianClient, loadConfig } from "./lib/obsidian";
import { cityCache } from "./lib/drafts";
import { earnedWatts, levelFromWatts, orderBonus, skylineCap, streakOf, workOrders } from "./lib/game/watts";
import { CATALOG, EMPTY_STATE, loadGameState, saveGameState } from "./lib/game/shop";
import type { GameState } from "./lib/game/shop";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const HUM_KEY = "yeyufm.hum";
const CHIME_KEY = "yeyufm.chime";

export default function Home() {
  const [metrics, setMetrics] = useState<NoteMetric[]>([]);
  const [nowTs, setNowTs] = useState(0);
  const [intro, setIntro] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [camX, setCamX] = useState(0);
  const [viewport, setViewport] = useState({ w: 1200, h: 800 });
  const [hover, setHover] = useState<{ file: string; x: number; y: number } | null>(null);
  const [focusFile, setFocusFile] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState<{ file: string; n: number } | null>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [humOn, setHumOn] = useState(false);
  const [chimeOn, setChimeOn] = useState(true);
  const [synced, setSynced] = useState<"live" | "cached" | "local">("local");
  const [gl3d, setGl3d] = useState(true);
  const [shopOpen, setShopOpen] = useState(false);
  const [game, setGame] = useState<GameState>(EMPTY_STATE);
  const [searchHits, setSearchHits] = useState<Set<string> | null>(null);
  const [monthIx, setMonthIx] = useState(-1);
  const [goMonth, setGoMonth] = useState<{ x: number; z: number; n: number } | null>(null);
  const [requestSetup, setRequestSetup] = useState(0);
  const [zen, setZen] = useState(false);
  const [ceremony, setCeremony] = useState<{ file: string; n: number } | null>(null);
  const [dexOpen, setDexOpen] = useState(false);

  const humRef = useRef<Hum | null>(null);
  const clientRef = useRef<ObsidianClient | null>(null);
  const camRef = useRef(0);
  const camAnimRef = useRef<number | null>(null);
  const camInitRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const writeOpenRef = useRef(false);
  const wordsThrottleRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const hum = useCallback(() => {
    humRef.current ??= new Hum();
    return humRef.current;
  }, []);

  /* ---------- data ---------- */

  useEffect(() => {
    void Promise.resolve().then(() => {
      const now = Date.now();
      setNowTs(now);
      const demo = new URLSearchParams(window.location.search).get("demo");
      if (demo) {
        setMetrics(demoMetrics(Number(demo) || 50, now));
        setSynced("local");
        return;
      }
      const config = loadConfig();
      const client = config ? new ObsidianClient(config) : null;
      clientRef.current = client;
      void loadCityMetrics(client, (fresh) => {
        setMetrics(fresh);
        setSynced("live");
      }).then((quick) => {
        setMetrics((prev) => (prev.length > 0 ? prev : quick));
        setSynced(client ? "cached" : "local");
      });
      // game state heals from the vault copy when connected
      void loadGameState(client).then((state) => setGame(state));
    });
  }, []);

  /* ---------- derived city ---------- */

  const buildings = useMemo(() => layout(metrics, nowTs), [metrics, nowTs]);
  const cw = useMemo(() => contentWidth(buildings), [buildings]);
  const cityPlan = useMemo(() => planCity(metrics, nowTs), [metrics, nowTs]);

  /* ---------- watts & the depot ---------- */

  const today = useMemo(() => {
    if (!nowTs) return "";
    const d = new Date(nowTs);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [nowTs]);
  const earned = useMemo(
    () => earnedWatts(metrics) + orderBonus(metrics, today),
    [metrics, today],
  );
  const balance = earned - game.spent;
  const level = useMemo(() => levelFromWatts(earned), [earned]);
  const levelCap = skylineCap(level);
  const streak = useMemo(() => streakOf(metrics, today), [metrics, today]);
  const orders = useMemo(() => workOrders(metrics, today), [metrics, today]);
  const dex = useMemo(() => {
    const count = (a: number) => cityPlan.lots.filter((l) => l.arch === a).length;
    return [
      { id: 10, name: "Lighthouse", line: "The first page after seven days away.", n: count(10) },
      { id: 11, name: "Arch", line: "A page written for a past empty day.", n: count(11) },
      { id: 12, name: "Chapel", line: "Written in the smallest hours, 2-4 am.", n: count(12) },
    ];
  }, [cityPlan.lots]);

  const buy = useCallback(
    (id: string) => {
      const item = CATALOG.find((i) => i.id === id);
      if (!item) return;
      setGame((prev) => {
        if (prev.owned.includes(id)) {
          // owned weather toggles on/off, owned skins re-apply
          if (item.kind === "weather") {
            const next: GameState = {
              ...prev,
              weather: prev.weather === id ? "none" : (id as GameState["weather"]),
              updatedAt: Date.now(),
            };
            void saveGameState(next, clientRef.current);
            return next;
          }
          if (item.kind === "skin" && prev.skin !== id) {
            const next: GameState = { ...prev, skin: id as GameState["skin"], updatedAt: Date.now() };
            void saveGameState(next, clientRef.current);
            return next;
          }
          return prev;
        }
        if (earned - prev.spent < item.cost) return prev;
        const next: GameState = {
          spent: prev.spent + item.cost,
          owned: [...prev.owned, id],
          skin: item.kind === "skin" ? (id as GameState["skin"]) : prev.skin,
          weather: item.kind === "weather" ? (id as GameState["weather"]) : prev.weather,
          updatedAt: Date.now(),
        };
        void saveGameState(next, clientRef.current);
        hum().settle();
        return next;
      });
    },
    [earned, hum],
  );

  const extras = useMemo(
    () => ({
      cats: game.owned.includes("cats") ? 4 : 0,
      birds: game.owned.includes("birds") ? 6 : 0,
      dogs: game.owned.includes("dog") ? 1 : 0,
    }),
    [game.owned],
  );
  const decor = useMemo(
    () => ({
      lamps: game.owned.includes("lamps"),
      trees: game.owned.includes("trees"),
      fountain: game.owned.includes("fountain"),
    }),
    [game.owned],
  );

  /* density-constant view: building size is fixed by the vertical budget,
     so a small city feels close and a large one grows wider, not denser */
  const scale = useMemo(() => {
    if (buildings.length === 0) return 1;
    const maxH = buildings.reduce((m, b) => Math.max(m, b.h), 40);
    const cityH = viewport.h * (writeOpen ? 0.34 : 1);
    return clamp((cityH * 0.3) / maxH, 0.7, 2.0);
  }, [buildings, viewport.h, writeOpen]);

  const days = useMemo(() => {
    const seen = new Map<string, { x: number; count: number }>();
    for (const b of buildings) {
      const entry = seen.get(b.date);
      if (entry) {
        entry.x = (entry.x * entry.count + b.x + b.w / 2) / (entry.count + 1);
        entry.count += 1;
      } else {
        seen.set(b.date, { x: b.x + b.w / 2, count: 1 });
      }
    }
    return [...seen.entries()]
      .map(([date, v]) => ({ date, x: v.x }))
      .sort((a, b) => a.x - b.x);
  }, [buildings]);

  useEffect(() => {
    const q = query.trim();
    const client = clientRef.current;
    if (!searchOpen || !q || !client) {
      setSearchHits(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      client
        .search(q, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) setSearchHits(new Set(found.map((f) => f.name)));
        })
        .catch(() => {});
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, searchOpen]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchOpen || !q) return null;
    const byName = new Set(
      metrics.filter((m) => m.file.toLowerCase().includes(q)).map((m) => m.file),
    );
    if (!searchHits) return byName;
    return new Set([...byName, ...searchHits]);
  }, [searchOpen, query, metrics, searchHits]);

  useEffect(() => {
    const n = cityPlan.blocks.length - 1;
    const id = window.setTimeout(() => setMonthIx(n), 0);
    return () => window.clearTimeout(id);
  }, [cityPlan.blocks.length]);

  const jumpMonth = useCallback(
    (dir: -1 | 1) => {
      setMonthIx((prev) => {
        const next = Math.min(cityPlan.blocks.length - 1, Math.max(0, prev + dir));
        const block = cityPlan.blocks[next];
        if (block) setGoMonth({ x: block.x, z: block.z, n: Date.now() });
        return next;
      });
    },
    [cityPlan.blocks],
  );

  const centerDate = useMemo(() => {
    if (days.length === 0) return "";
    let best = days[0];
    for (const d of days) if (Math.abs(d.x - camX) < Math.abs(best.x - camX)) best = d;
    return best.date;
  }, [days, camX]);

  /* ---------- camera ---------- */

  const applyCam = useCallback((value: number) => {
    camRef.current = value;
    setCamX(value);
  }, []);

  const camBounds = useCallback(() => {
    const half = viewport.w / (2 * scale);
    if (cw <= half * 2) return [cw / 2, cw / 2] as const;
    return [half * 0.7, cw - half * 0.7] as const;
  }, [cw, scale, viewport.w]);

  const panCam = useCallback(
    (dxWorld: number) => {
      if (camAnimRef.current !== null) {
        cancelAnimationFrame(camAnimRef.current);
        camAnimRef.current = null;
      }
      const [lo, hi] = camBounds();
      applyCam(clamp(camRef.current + dxWorld, lo, hi));
    },
    [applyCam, camBounds],
  );

  const glideCam = useCallback(
    (target: number) => {
      if (camAnimRef.current !== null) cancelAnimationFrame(camAnimRef.current);
      const [lo, hi] = camBounds();
      const goal = clamp(target, lo, hi);
      const frame = () => {
        const current = camRef.current;
        const next = current + (goal - current) * 0.16;
        if (Math.abs(goal - next) < 0.4) {
          applyCam(goal);
          camAnimRef.current = null;
          return;
        }
        applyCam(next);
        camAnimRef.current = requestAnimationFrame(frame);
      };
      camAnimRef.current = requestAnimationFrame(frame);
    },
    [applyCam, camBounds],
  );

  const stepDay = useCallback(
    (dir: -1 | 1) => {
      if (days.length === 0) return;
      let index = 0;
      let bestDist = Infinity;
      for (let i = 0; i < days.length; i += 1) {
        const dist = Math.abs(days[i].x - camRef.current);
        if (dist < bestDist) {
          bestDist = dist;
          index = i;
        }
      }
      const next = clamp(index + dir, 0, days.length - 1);
      glideCam(days[next].x);
    },
    [days, glideCam],
  );

  /* initial camera: rest on the newest part of the city */
  useEffect(() => {
    if (camInitRef.current || buildings.length === 0) return;
    camInitRef.current = true;
    const [lo, hi] = camBounds();
    applyCam(clamp(cw, lo, hi));
  }, [buildings, camBounds, applyCam, cw]);

  /* ---------- intro ---------- */

  useEffect(() => {
    const t1 = window.setTimeout(() => setIntro(true), 150);
    const t2 = window.setTimeout(() => setIntroDone(true), 2100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  /* ---------- viewport ---------- */

  useEffect(() => {
    const measure = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* ---------- sound prefs ---------- */

  useEffect(() => {
    try {
      if (window.localStorage.getItem(HUM_KEY) === "1") {
        window.setTimeout(() => setHumOn(true), 0);
      }
      if (window.localStorage.getItem(CHIME_KEY) === "0") {
        window.setTimeout(() => setChimeOn(false), 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    hum().setChime(chimeOn);
    try {
      window.localStorage.setItem(CHIME_KEY, chimeOn ? "1" : "0");
    } catch {}
  }, [chimeOn, hum]);

  const toggleHum = useCallback(() => {
    setHumOn((on) => {
      const next = !on;
      hum().setHum(next);
      try {
        window.localStorage.setItem(HUM_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, [hum]);

  /* resume hum on first gesture if it was on */
  useEffect(() => {
    if (!humOn) return;
    const onGesture = () => hum().setHum(true);
    window.addEventListener("pointerdown", onGesture, { once: true });
    return () => window.removeEventListener("pointerdown", onGesture);
  }, [humOn, hum]);

  /* ---------- idle fade ---------- */

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    if (writeOpenRef.current) return;
    idleTimerRef.current = window.setTimeout(() => setUiVisible(false), 6000);
  }, []);

  const registerActivity = useCallback(() => {
    setUiVisible(true);
    scheduleIdle();
  }, [scheduleIdle]);

  useEffect(() => {
    scheduleIdle();
    window.addEventListener("pointermove", registerActivity, { passive: true });
    window.addEventListener("pointerdown", registerActivity, { passive: true });
    return () => {
      window.removeEventListener("pointermove", registerActivity);
      window.removeEventListener("pointerdown", registerActivity);
    };
  }, [registerActivity, scheduleIdle]);

  /* ---------- writing ---------- */

  const openWrite = useCallback((file?: string) => {
    writeOpenRef.current = true;
    setWriteOpen(true);
    setUiVisible(true);
    if (file) setRequestOpen({ file, n: Date.now() });
  }, []);

  const closeWrite = useCallback(() => {
    writeOpenRef.current = false;
    setWriteOpen(false);
    setFocusFile(null);
    setRequestOpen(null);
  }, []);

  /** live growth: the building breathes while you type */
  const onWords = useCallback((file: string, words: number) => {
    const now = Date.now();
    if (now - wordsThrottleRef.current < 300) return;
    wordsThrottleRef.current = now;
    setMetrics((prev) => {
      const index = prev.findIndex((m) => m.file === file);
      if (index >= 0) {
        if (Math.abs(prev[index].words - words) < 2) return prev;
        const next = [...prev];
        next[index] = { ...next[index], words, mtime: now };
        return next;
      }
      return [...prev, { file, date: dateOf(file, now), words, mtime: now }];
    });
    setFocusFile(file);
  }, []);

  const onSaved = useCallback(
    (file: string, isNew: boolean) => {
      if (isNew) {
        hum().settle();
        setCeremony({ file, n: Date.now() });
      }
      setMetrics((prev) => {
        const m = prev.find((x) => x.file === file);
        if (m) void cityCache.put({ file: m.file, date: m.date, words: m.words, mtime: Date.now() });
        return prev;
      });
    },
    [hum],
  );

  /* ---------- fullscreen / keyboard ---------- */

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {}
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      registerActivity();
      if (event.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          setQuery("");
        } else if (dexOpen) setDexOpen(false);
        else if (shopOpen) setShopOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (writeOpenRef.current) closeWrite();
        return;
      }
      const target = event.target as HTMLElement | null;
      const isControl =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isControl) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepDay(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepDay(1);
      } else if (event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        if (writeOpenRef.current) closeWrite();
        else openWrite();
      } else if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        setShopOpen((v) => !v);
      } else if (event.key === "[") {
        event.preventDefault();
        jumpMonth(-1);
      } else if (event.key === "]") {
        event.preventDefault();
        jumpMonth(1);
      } else if (event.key === "z" || event.key === "Z") {
        event.preventDefault();
        setZen((v) => !v);
      } else if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        setDexOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeWrite, dexOpen, jumpMonth, openWrite, registerActivity, searchOpen, settingsOpen, shopOpen, stepDay]);

  /* ---------- wheel pans the city ---------- */

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLElement>) => {
      if (writeOpenRef.current) return;
      if ((event.target as HTMLElement).closest(".notes-panel, .settings-panel, .city-canvas-3d")) return;
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      panCam((clamp(delta, -80, 80) * 0.9) / scale);
    },
    [panCam, scale],
  );

  /* ---------- ruler drag ---------- */

  const rulerDragRef = useRef(false);
  const rulerToCam = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const f = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const [lo, hi] = camBounds();
      applyCam(lo + (hi - lo) * f);
    },
    [applyCam, camBounds],
  );

  /* ---------- render ---------- */

  const empty = buildings.length === 0;
  const rulerFraction = (() => {
    const [lo, hi] = camBounds();
    return hi === lo ? 0.5 : clamp((camX - lo) / (hi - lo), 0, 1);
  })();

  const rootClass = [
    "city-app",
    writeOpen ? "writing" : "",
    uiVisible || writeOpen || settingsOpen ? "ui-visible" : "ui-hidden",
    introDone ? "intro-done" : "intro-running",
    zen ? "zen" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={rootClass} onWheel={onWheel}>
      <div className="city-field">
        {gl3d ? (
          <City3D
            plan={cityPlan}
            focus={focusFile}
            matches={matches}
            intro={intro}
            extras={extras}
            decor={decor}
            skin={game.skin}
            weather={game.weather}
            goMonth={goMonth}
            ceremony={ceremony}
            levelCap={levelCap}
            streak={streak}
            onHover={(file, x, y) => setHover(file ? { file, x, y } : null)}
            onOpen={(file) => openWrite(file)}
            onFail={() => setGl3d(false)}
          />
        ) : (
          <City
            buildings={buildings}
            camX={camX}
            scale={scale}
            intro={intro}
            focus={focusFile}
            matches={matches}
            onHover={(file, x, y) => setHover(file ? { file, x, y } : null)}
            onOpen={(file) => openWrite(file)}
            onPan={panCam}
          />
        )}
        {hover && !writeOpen && (
          <div
            className="city-label"
            style={{ left: hover.x, top: hover.y - 34 }}
            aria-hidden="true"
          >
            {hover.file.replace(/\.md$/, "")}
          </div>
        )}
        {empty && introDone && (
          <button type="button" className="city-first" onClick={() => openWrite()}>
            <span className="first-foundation" aria-hidden="true" />
            the first structure
          </button>
        )}
      </div>

      <div className="grain" aria-hidden="true" />

      <div className={"intro-veil" + (introDone ? " done" : "")} aria-hidden={introDone}>
        <h1 className="intro-brand">Tata</h1>
        <p className="intro-line">Signal becomes structure.</p>
      </div>

      <header className="topbar immersion-ui">
        <div className="brand">
          <span className="brand-word">Tata</span>
          <button
            type="button"
            className={"signal" + (synced === "live" ? " live" : "")}
            onClick={() => {
              if (synced !== "live") {
                openWrite();
                setRequestSetup(Date.now());
              }
            }}
            title={synced === "live" ? "Connected to Obsidian" : "Connect Obsidian"}
          >
            <i />
            {synced === "live" ? "receiving" : "connect"}
          </button>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            onClick={toggleHum}
            className={humOn ? "active" : ""}
            aria-label={humOn ? "Mute hum" : "City hum"}
            aria-pressed={humOn}
          >
            <span className="icon-hum" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchOpen(true);
              window.setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            className={searchOpen ? "active" : ""}
            aria-label="Search"
          >
            <span className="icon-search" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShopOpen(!shopOpen)}
            className={shopOpen ? "active" : ""}
            aria-label="Depot"
            aria-expanded={shopOpen}
          >
            <span className="icon-depot" aria-hidden="true">
              <i />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={settingsOpen ? "active" : ""}
            aria-label="Settings"
            aria-expanded={settingsOpen}
          >
            <span className="icon-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className={isFullscreen ? "active" : ""}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <span className="icon-fullscreen" aria-hidden="true" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="search-veil immersion-ui">
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="light up the city…"
            spellCheck={false}
            aria-label="Search notes"
          />
        </div>
      )}

      {!empty && !writeOpen && !gl3d && (
        <div className="time-dock immersion-ui">
          <span className="time-date">{centerDate}</span>
          <div
            className="time-ruler"
            onPointerDown={(event) => {
              rulerDragRef.current = true;
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {}
              rulerToCam(event);
            }}
            onPointerMove={(event) => {
              if (rulerDragRef.current) rulerToCam(event);
            }}
            onPointerUp={() => {
              rulerDragRef.current = false;
            }}
            onPointerCancel={() => {
              rulerDragRef.current = false;
            }}
            aria-hidden="true"
          >
            <i className="today-needle" style={{ left: `${rulerFraction * 100}%` }} />
            {days.map((d) => (
              <span
                key={d.date}
                className="day-mark"
                style={{ left: `${cw > 0 ? (d.x / cw) * 100 : 50}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {!writeOpen && (
        <button
          type="button"
          className="tonight-cta immersion-ui"
          onClick={() => openWrite()}
          title="Write today's page — N"
        >
          Today
        </button>
      )}

      {gl3d && !empty && !writeOpen && cityPlan.blocks.length > 0 && (
        <div className="month-dock immersion-ui" aria-label="Months">
          <button type="button" onClick={() => jumpMonth(-1)} aria-label="Earlier month">
            ◀
          </button>
          <span>{cityPlan.blocks[Math.max(0, monthIx)]?.month ?? ""}</span>
          <button type="button" onClick={() => jumpMonth(1)} aria-label="Later month">
            ▶
          </button>
        </div>
      )}

      <Clock />

      <NotesPanel
        open={writeOpen}
        onClose={closeWrite}
        requestOpen={requestOpen}
        requestSetup={requestSetup}
        onWords={onWords}
        onSaved={onSaved}
        onActiveFile={setFocusFile}
      />

      <aside
        className="settings-panel dex-panel"
        aria-label="Registry"
        aria-hidden={!dexOpen}
        inert={!dexOpen}
      >
        <div className="panel-heading">
          <span>Registry</span>
          <button type="button" onClick={() => setDexOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dex-items">
          {dex.map((d) => (
            <div key={d.id} className={"dex-item" + (d.n > 0 ? " found" : "")}>
              <strong>{d.n > 0 ? d.name : "?????"}</strong>
              <em>{d.line}</em>
              <span>{d.n > 0 ? `standing: ${d.n}` : "not yet built"}</span>
            </div>
          ))}
        </div>
        <p className="depot-note">The city remembers how each page was written.</p>
      </aside>

      <aside
        className="settings-panel shop-panel"
        aria-label="Depot"
        aria-hidden={!shopOpen}
        inert={!shopOpen}
      >
        <div className="panel-heading">
          <span>Depot</span>
          <button type="button" onClick={() => setShopOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="depot-balance">
          <b>{balance}</b>
          <span>
            watts · level {level} · skyline {levelCap} floors
          </span>
        </div>
        <div className="depot-orders" aria-label="Tonight's work orders">
          {orders.map((o) => (
            <span key={o.id} className={o.done ? "done" : ""}>
              {o.done ? "■" : "□"} {o.name} <b>+{o.bonus}</b>
            </span>
          ))}
        </div>
        <div className="depot-items">
          {CATALOG.map((item) => {
            const owned = game.owned.includes(item.id);
            const affordable = balance >= item.cost;
            const active =
              (item.kind === "weather" && game.weather === item.id) ||
              (item.kind === "skin" && game.skin === item.id);
            const clickable = owned
              ? item.kind === "weather" || (item.kind === "skin" && !active)
              : affordable;
            return (
              <button
                key={item.id}
                type="button"
                className={"depot-item" + (owned ? " owned" : "") + (active ? " active" : "")}
                disabled={!clickable}
                onClick={() => buy(item.id)}
              >
                <strong>{item.name}</strong>
                <em>{item.line}</em>
                <span>
                  {active ? "tonight" : owned ? "in the city" : `${item.cost} W`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="depot-note">Everything here is earned. Amber is not for sale.</p>
      </aside>

      <aside
        className="settings-panel"
        aria-label="Settings"
        aria-hidden={!settingsOpen}
        inert={!settingsOpen}
      >
        <div className="panel-heading">
          <span>Settings</span>
          <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="panel-toggles">
          <label>
            <span>City hum</span>
            <button
              type="button"
              className={"toggle" + (humOn ? " on" : "")}
              onClick={toggleHum}
              aria-pressed={humOn}
            >
              <i />
            </button>
          </label>
          <label>
            <span>Settle chime</span>
            <button
              type="button"
              className={"toggle" + (chimeOn ? " on" : "")}
              onClick={() => setChimeOn(!chimeOn)}
              aria-pressed={chimeOn}
            >
              <i />
            </button>
          </label>
        </div>
        <div className="panel-shortcuts">
          <span><b>← →</b> walk the days</span>
          <span><b>/</b> search</span>
          <span><b>N</b> write</span>
          <span><b>Esc</b> close</span>
        </div>
      </aside>
    </main>
  );
}

function Clock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      setDate(
        now.toLocaleDateString("en-GB", { weekday: "long", month: "short", day: "numeric" }),
      );
    };
    tick();
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="night-clock immersion-ui" aria-hidden="true">
      <b>{time}</b>
      <span>{date}</span>
    </div>
  );
}
