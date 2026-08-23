import { useEffect, useMemo, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { supabase } from "./supabase";

const cats = ["Dream", "Wish", "Goal", "Thought"];

const ico = {
  Dream: "🌟",
  Wish: "💖",
  Goal: "🎯",
  Thought: "💭",
};

const DAILY_LIMIT = 3;

// --------------------------------------------------
// GET TODAY IN THE USER'S LOCAL DATE
// --------------------------------------------------

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// --------------------------------------------------
// CREATE A STABLE STAR POSITION FROM ITS ID
// --------------------------------------------------

function getStarPosition(id) {
  let hash = 0;

  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }

  const x = 8 + (Math.abs(hash) % 84);
  const y = 10 + (Math.abs(hash * 7) % 72);
  const size = 18 + (Math.abs(hash * 13) % 18);

  return {
    x,
    y,
    size,
  };
}

// --------------------------------------------------
// MAIN APP
// --------------------------------------------------

function App() {
  const [page, setPage] = useState("landing");
  const [session, setSession] = useState(null);

  const [stars, setStars] = useState([]);
  const [filter, setFilter] = useState("All");

  const [mode, setMode] = useState("signup");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [starName, setStarName] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("Dream");

  const [editingId, setEditingId] = useState(null);

  const [selectedStar, setSelectedStar] = useState(null);
  const [deleteStarId, setDeleteStarId] = useState(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [todayCount, setTodayCount] = useState(0);

  // --------------------------------------------------
  // AUTH SESSION
  // --------------------------------------------------

  useEffect(() => {
    let mounted = true;

    async function getInitialSession() {
      const {
        data,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      setSession(data.session);

      if (data.session) {
        setPage("dashboard");
      }
    }

    getInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);

        if (currentSession) {
          setPage("dashboard");
        } else {
          setStars([]);
          setTodayCount(0);
          setPage("landing");
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // --------------------------------------------------
  // LOAD STARS
  // --------------------------------------------------

  useEffect(() => {
    if (session?.user?.id) {
      loadStars();
    }
  }, [session]);

  async function loadStars() {
    if (!session?.user?.id) return;

    setError("");

    const {
      data,
      error: queryError,
    } = await supabase
      .from("stars")
      .select(
        "id,name,message,category,created_at,updated_at"
      )
      .eq("user_id", session.user.id)
      .order("created_at", {
        ascending: false,
      });

    if (queryError) {
      setError(queryError.message);
      return;
    }

    const loadedStars = data || [];

    setStars(loadedStars);

    calculateTodayCount(loadedStars);
  }

  // --------------------------------------------------
  // COUNT TODAY'S STARS
  // --------------------------------------------------

  function calculateTodayCount(list) {
    const today = getLocalDate();

    const count = list.filter((star) => {
      const date = new Date(star.created_at);

      const year = date.getFullYear();
      const month = String(
        date.getMonth() + 1
      ).padStart(2, "0");
      const day = String(
        date.getDate()
      ).padStart(2, "0");

      const starDate = `${year}-${month}-${day}`;

      return starDate === today;
    }).length;

    setTodayCount(count);
  }

  // --------------------------------------------------
  // AUTH NAVIGATION
  // --------------------------------------------------

  function auth(nextMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPage("auth");
  }

  // --------------------------------------------------
  // SIGN UP / SIGN IN
  // --------------------------------------------------

  async function submitAuth(e) {
    e.preventDefault();

    setError("");
    setNotice("");

    if (mode === "signup" && !name.trim()) {
      return setError(
        "Please enter your name."
      );
    }

    if (
      mode === "signup" &&
      password !== confirm
    ) {
      return setError(
        "Passwords do not match."
      );
    }

    if (password.length < 6) {
      return setError(
        "Password must be at least 6 characters."
      );
    }

    setBusy(true);

    try {
      if (mode === "signup") {
        const {
          data,
          error: authError,
        } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: name.trim(),
            },
          },
        });

        if (authError) throw authError;

        if (data.session) {
          setPage("dashboard");
        } else {
          setNotice(
            "Account created. Check your email to confirm it, then sign in."
          );
        }
      } else {
        const {
          error: authError,
        } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (authError) throw authError;

        setPage("dashboard");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // OPEN CREATE PAGE
  // --------------------------------------------------

  function openCreatePage() {
    setError("");
    setNotice("");

    setEditingId(null);
    setStarName("");
    setMessage("");
    setCategory("Dream");

    setPage("create");
  }

  // --------------------------------------------------
  // SAVE STAR
  // --------------------------------------------------

  async function saveStar(e) {
    e.preventDefault();

    setError("");

    if (
      !starName.trim() ||
      !message.trim()
    ) {
      return setError(
        "Please give your star a name and message."
      );
    }

    if (!session?.user?.id) {
      return setError(
        "Your session has expired. Please sign in again."
      );
    }

    setBusy(true);

    try {
      // ----------------------------------------------
      // EDIT EXISTING STAR
      // ----------------------------------------------

      if (editingId) {
        const {
          error: updateError,
        } = await supabase
          .from("stars")
          .update({
            name: starName.trim(),
            message: message.trim(),
            category,
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", editingId)
          .eq(
            "user_id",
            session.user.id
          );

        if (updateError) {
          throw updateError;
        }

        setStarName("");
        setMessage("");
        setCategory("Dream");
        setEditingId(null);

        await loadStars();

        setPage("dashboard");

        return;
      }

      // ----------------------------------------------
      // DAILY LIMIT
      // ----------------------------------------------

      const currentToday = getLocalDate();

      const todayStars = stars.filter(
        (star) => {
          const date = new Date(
            star.created_at
          );

          const year =
            date.getFullYear();

          const month = String(
            date.getMonth() + 1
          ).padStart(2, "0");

          const day = String(
            date.getDate()
          ).padStart(2, "0");

          return (
            `${year}-${month}-${day}` ===
            currentToday
          );
        }
      );

      if (
        todayStars.length >=
        DAILY_LIMIT
      ) {
        setBusy(false);

        return setError(
          "🌌 You have used all 3 stars for today. Come back tomorrow!"
        );
      }

      // ----------------------------------------------
      // CREATE NEW STAR
      // ----------------------------------------------

      const {
        error: insertError,
      } = await supabase
        .from("stars")
        .insert({
          user_id: session.user.id,
          name: starName.trim(),
          message: message.trim(),
          category,
        });

      if (insertError) {
        throw insertError;
      }

      setStarName("");
      setMessage("");
      setCategory("Dream");
      setEditingId(null);

      await loadStars();

      setPage("dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // EDIT STAR
  // --------------------------------------------------

  function editStar(star) {
    setStarName(star.name);
    setMessage(star.message);
    setCategory(star.category);

    setEditingId(star.id);

    setSelectedStar(null);

    setError("");
    setNotice("");

    setPage("create");
  }

  // --------------------------------------------------
  // ASK DELETE
  // --------------------------------------------------

  function askDeleteStar(id) {
    setSelectedStar(null);
    setDeleteStarId(id);
  }

  // --------------------------------------------------
  // DELETE STAR
  // --------------------------------------------------

  async function confirmDeleteStar() {
    if (!deleteStarId) return;

    if (!session?.user?.id) {
      setDeleteStarId(null);

      return setError(
        "Your session has expired. Please sign in again."
      );
    }

    setBusy(true);
    setError("");

    try {
      const {
        error: deleteError,
      } = await supabase
        .from("stars")
        .delete()
        .eq("id", deleteStarId)
        .eq(
          "user_id",
          session.user.id
        );

      if (deleteError) {
        throw deleteError;
      }

      const updatedStars =
        stars.filter(
          (star) =>
            star.id !== deleteStarId
        );

      setStars(updatedStars);

      calculateTodayCount(
        updatedStars
      );

      setDeleteStarId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // COUNTERS
  // --------------------------------------------------

  const counts = useMemo(
    () =>
      Object.fromEntries(
        cats.map((cat) => [
          cat,
          stars.filter(
            (star) =>
              star.category === cat
          ).length,
        ])
      ),
    [stars]
  );

  // --------------------------------------------------
  // FILTERED STARS
  // --------------------------------------------------

  const shown =
    filter === "All"
      ? stars
      : stars.filter(
          (star) =>
            star.category === filter
        );

  // --------------------------------------------------
  // DISPLAY NAME
  // --------------------------------------------------

  const displayName =
    session?.user?.user_metadata
      ?.display_name ||
    session?.user?.email
      ?.split("@")[0] ||
    "Stargazer";

  // --------------------------------------------------
  // NAV
  // --------------------------------------------------

  const nav = session ? (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
      }}
      className="rounded-full border border-white/15 px-5 py-2 transition hover:bg-white/10"
    >
      Sign Out
    </button>
  ) : (
    <div className="flex gap-2">
      <button
        onClick={() =>
          auth("signin")
        }
        className="rounded-full px-4 py-2 transition hover:bg-white/10"
      >
        Sign In
      </button>

      <button
        onClick={() =>
          auth("signup")
        }
        className="rounded-full bg-purple-600 px-4 py-2 font-semibold transition hover:bg-purple-500"
      >
        Create Account
      </button>
    </div>
  );

  // ==================================================
  // AUTH PAGE
  // ==================================================

  if (page === "auth") {
    return (
      <Shell nav={nav}>
        <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-5">
          <form
            onSubmit={submitAuth}
            className="w-full max-w-md rounded-3xl border border-purple-300/20 bg-[#17103b]/90 p-8 shadow-2xl shadow-purple-900/40"
          >
            <p className="text-3xl">
              🌌
            </p>

            <h2 className="mt-3 text-3xl font-bold">
              {mode === "signup"
                ? "Create your galaxy"
                : "Welcome back"}
            </h2>

            <p className="mt-2 text-white/60">
              {mode === "signup"
                ? "Start your own universe of stars."
                : "Sign in to continue to your galaxy."}
            </p>

            {mode === "signup" && (
              <Field
                label="Name"
                value={name}
                set={setName}
                placeholder="Your name"
              />
            )}

            <Field
              label="Email"
              value={email}
              set={setEmail}
              type="email"
              placeholder="you@example.com"
            />

            <Field
              label="Password"
              value={password}
              set={setPassword}
              type="password"
              placeholder="At least 6 characters"
            />

            {mode === "signup" && (
              <Field
                label="Confirm password"
                value={confirm}
                set={setConfirm}
                type="password"
                placeholder="Repeat your password"
              />
            )}

            {error && (
              <Alert text={error} />
            )}

            {notice && (
              <p className="mt-4 rounded-xl border border-green-400/20 bg-green-500/10 p-3 text-sm text-green-200">
                {notice}
              </p>
            )}

            <button
              disabled={busy}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 py-3 font-semibold disabled:opacity-50"
            >
              {busy
                ? "Please wait..."
                : mode === "signup"
                ? "✨ Create My Account"
                : "🌌 Sign In"}
            </button>

            <p className="mt-5 text-center text-sm text-white/60">
              {mode === "signup"
                ? "Already have an account?"
                : "New to Dream Galaxy?"}{" "}

              <button
                type="button"
                onClick={() => {
                  setMode(
                    mode === "signup"
                      ? "signin"
                      : "signup"
                  );

                  setError("");
                  setNotice("");
                }}
                className="font-semibold text-purple-300"
              >
                {mode === "signup"
                  ? "Sign In"
                  : "Create Account"}
              </button>
            </p>
          </form>
        </main>
      </Shell>
    );
  }

  // ==================================================
  // CREATE / EDIT PAGE
  // ==================================================

  if (
    page === "create" &&
    session
  ) {
    const remaining =
      Math.max(
        0,
        DAILY_LIMIT - todayCount
      );

    return (
      <Shell nav={nav}>
        <main className="mx-auto max-w-2xl px-6 py-14">
          <button
            onClick={() => {
              setEditingId(null);
              setStarName("");
              setMessage("");
              setCategory("Dream");
              setError("");
              setPage("dashboard");
            }}
            className="text-purple-300 transition hover:text-purple-200"
          >
            ← Back to My Galaxy
          </button>

          <section className="mt-6 rounded-3xl border border-purple-300/20 bg-[#17103b]/90 p-8 shadow-2xl shadow-purple-900/20">
            <h2 className="text-3xl font-bold">
              {editingId
                ? "✏️ Edit Your Star"
                : "✨ Create a Star"}
            </h2>

            <p className="mt-2 text-white/60">
              {editingId
                ? "Update your star and keep your universe current."
                : "Give your dream a place in the universe."}
            </p>

            {!editingId && (
              <div className="mt-5 rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4">
                <p className="text-sm text-purple-200">
                  🌌 Daily stars
                </p>

                <p className="mt-1 text-white/70">
                  {remaining} of{" "}
                  {DAILY_LIMIT} stars
                  remaining today
                </p>
              </div>
            )}

            <form
              onSubmit={saveStar}
            >
              <Field
                label="Star name"
                value={starName}
                set={setStarName}
                placeholder="My Dream"
              />

              <label className="mt-5 block text-sm text-white/70">
                What should your star remember?

                <textarea
                  required
                  value={message}
                  onChange={(e) =>
                    setMessage(
                      e.target.value
                    )
                  }
                  rows="5"
                  placeholder="Write your dream, wish, goal or thought..."
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-purple-400"
                />
              </label>

              <p className="mt-5 text-sm text-white/70">
                Category
              </p>

              <div className="mt-2 grid grid-cols-2 gap-3">
                {cats.map((cat) => (
                  <button
                    type="button"
                    onClick={() =>
                      setCategory(cat)
                    }
                    key={cat}
                    className={`rounded-xl border p-3 transition ${
                      category === cat
                        ? "border-purple-400 bg-purple-500/20"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {ico[cat]}{" "}
                    {cat}
                  </button>
                ))}
              </div>

              {error && (
                <Alert text={error} />
              )}

              <button
                disabled={
                  busy ||
                  (!editingId &&
                    todayCount >=
                      DAILY_LIMIT)
                }
                className="mt-6 w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 py-4 font-semibold transition hover:opacity-90 disabled:opacity-50"
              >
                {busy
                  ? "Saving..."
                  : editingId
                  ? "💫 Update My Star"
                  : todayCount >=
                    DAILY_LIMIT
                  ? "🌌 Come Back Tomorrow"
                  : "✨ Send to My Galaxy"}
              </button>
            </form>
          </section>
        </main>
      </Shell>
    );
  }

  // ==================================================
  // VIEW MY GALAXY
  // ==================================================

  if (
    page === "viewGalaxy" &&
    session
  ) {
    return (
      <Shell nav={nav}>
        <main className="relative min-h-[calc(100vh-88px)] px-4 py-6 md:px-8">
          {/* BACK BUTTON */}

          <div className="mx-auto max-w-7xl">
            <button
              onClick={() =>
                setPage("dashboard")
              }
              className="mb-5 text-purple-300 transition hover:text-purple-200"
            >
              ← Back to Dashboard
            </button>

            {/* GALAXY */}

            <div className="relative h-[650px] overflow-hidden rounded-[2rem] border border-purple-300/20 bg-[#08052a] shadow-2xl shadow-purple-950/50">
              {/* CENTER GLOW */}

              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(130,80,255,0.22),transparent_62%)]" />

              {/* PURPLE NEBULA */}

              <div className="pointer-events-none absolute left-[20%] top-[20%] h-64 w-64 rounded-full bg-purple-600/10 blur-3xl" />

              <div className="pointer-events-none absolute bottom-[15%] right-[15%] h-72 w-72 rounded-full bg-pink-500/10 blur-3xl" />

              {/* MOON */}

              <div className="pointer-events-none absolute right-[6%] top-[5%] text-7xl drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                🌙
              </div>

              {/* PLANET */}

              <div className="pointer-events-none absolute bottom-[5%] left-[4%] text-7xl">
                🪐
              </div>

              {/* CATEGORY FILTERS */}

              <div className="absolute left-1/2 top-5 z-30 flex -translate-x-1/2 flex-wrap justify-center gap-2">
                {["All", ...cats].map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() =>
                        setFilter(cat)
                      }
                      className={`rounded-full border px-4 py-2 text-sm backdrop-blur-md transition ${
                        filter === cat
                          ? "border-purple-400 bg-purple-600/80 shadow-lg shadow-purple-900/50"
                          : "border-white/10 bg-black/30 hover:bg-purple-500/30"
                      }`}
                    >
                      {cat === "All"
                        ? "🌌 All"
                        : `${ico[cat]} ${cat}`}
                    </button>
                  )
                )}
              </div>

              {/* STARS */}

              {shown.map((star) => {
                const position =
                  getStarPosition(
                    star.id
                  );

                return (
                  <button
                    key={star.id}
                    onClick={() =>
                      setSelectedStar(
                        star
                      )
                    }
                    title={
                      star.name
                    }
                    className="absolute z-20 cursor-pointer transition duration-300 hover:scale-150"
                    style={{
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      fontSize: `${position.size}px`,
                      filter:
                        "drop-shadow(0 0 7px rgba(216,180,254,0.95))",
                    }}
                  >
                    <span className="animate-pulse">
                      {ico[
                        star.category
                      ]}
                    </span>
                  </button>
                );
              })}

              {/* EMPTY */}

              {shown.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-center">
                  <div>
                    <p className="text-6xl">
                      🌌
                    </p>

                    <h3 className="mt-4 text-2xl font-semibold">
                      No{" "}
                      {filter ===
                      "All"
                        ? "stars"
                        : filter.toLowerCase() +
                          "s"}{" "}
                      yet
                    </h3>

                    <p className="mt-2 text-white/50">
                      Create a star and
                      watch your galaxy
                      grow.
                    </p>
                  </div>
                </div>
              )}

              {/* GALAXY LABEL */}

              <div className="absolute bottom-6 left-6 z-20">
                <p className="text-sm tracking-[0.3em] text-purple-300">
                  MY GALAXY
                </p>

                <p className="mt-1 text-white/40">
                  {shown.length}{" "}
                  {shown.length === 1
                    ? "star"
                    : "stars"}{" "}
                  shining
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* STAR MESSAGE POPUP */}

        {selectedStar && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
            <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-purple-400/30 bg-gradient-to-br from-[#25105c] via-[#17103b] to-[#10082c] p-7 shadow-2xl shadow-purple-900/60">
              {/* glow */}

              <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-purple-500/20 blur-3xl" />

              <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-pink-500/10 blur-3xl" />

              <button
                onClick={() =>
                  setSelectedStar(
                    null
                  )
                }
                className="absolute right-5 top-4 text-xl text-white/50 transition hover:text-white"
              >
                ✕
              </button>

              <div className="relative">
                <p className="text-5xl">
                  {
                    ico[
                      selectedStar.category
                    ]
                  }
                </p>

                <p className="mt-4 text-sm tracking-[0.25em] text-purple-300">
                  {
                    selectedStar.category
                  }
                </p>

                <h2 className="mt-2 text-3xl font-bold text-white">
                  {
                    selectedStar.name
                  }
                </h2>

                <div className="mt-6 rounded-2xl border border-purple-300/20 bg-purple-950/40 p-5">
                  <p className="whitespace-pre-wrap leading-7 text-purple-100">
                    {
                      selectedStar.message
                    }
                  </p>
                </div>

                <p className="mt-4 text-xs text-purple-200/50">
                  Created{" "}
                  {new Date(
                    selectedStar.created_at
                  ).toLocaleDateString()}
                </p>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() =>
                      editStar(
                        selectedStar
                      )
                    }
                    className="flex-1 rounded-xl border border-purple-400/30 bg-purple-500/15 py-3 font-semibold text-purple-200 transition hover:bg-purple-500/25"
                  >
                    ✏️ Edit
                  </button>

                  <button
                    onClick={() =>
                      askDeleteStar(
                        selectedStar.id
                      )
                    }
                    className="flex-1 rounded-xl border border-red-400/20 bg-red-500/10 py-3 font-semibold text-red-200 transition hover:bg-red-500/20"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  // ==================================================
  // DELETE POPUP
  // ==================================================

  const deleteTarget =
    stars.find(
      (star) =>
        star.id === deleteStarId
    );

  // ==================================================
  // DASHBOARD
  // ==================================================

  if (
    page === "dashboard" &&
    session
  ) {
    const remaining =
      Math.max(
        0,
        DAILY_LIMIT - todayCount
      );

    return (
      <Shell nav={nav}>
        <main className="relative mx-auto min-h-[calc(100vh-88px)] max-w-6xl px-6 py-12">
          {/* HEADER */}

          <p className="text-sm tracking-[0.3em] text-purple-300">
            YOUR PERSONAL UNIVERSE
          </p>

          <h2 className="mt-2 text-4xl font-bold">
            Welcome,{" "}
            {displayName} ✨
          </h2>

          <p className="mt-3 max-w-xl text-white/60">
            Your dreams, wishes, goals,
            and thoughts belong safely
            in your galaxy.
          </p>

          {/* DAILY LIMIT */}

          <div className="mt-7 rounded-2xl border border-purple-300/20 bg-purple-500/10 p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="font-semibold text-purple-200">
                  🌌 Today's stars
                </p>

                <p className="mt-1 text-sm text-white/60">
                  You can create up to 3
                  stars every day.
                  Unused stars don't carry
                  over.
                </p>
              </div>

              <div className="text-left md:text-right">
                <p className="text-3xl font-bold">
                  {remaining}
                </p>

                <p className="text-xs text-white/50">
                  remaining today
                </p>
              </div>
            </div>
          </div>

          {/* MAIN BUTTONS */}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              disabled={
                todayCount >=
                DAILY_LIMIT
              }
              onClick={
                openCreatePage
              }
              className="rounded-full bg-gradient-to-r from-purple-600 to-pink-500 px-7 py-4 font-semibold shadow-lg shadow-purple-900/30 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {todayCount >=
              DAILY_LIMIT
                ? "🌌 Daily Limit Reached"
                : "✨ Create a Star"}
            </button>

            <button
              onClick={() => {
                setFilter("All");
                setPage(
                  "viewGalaxy"
                );
              }}
              className="rounded-full border border-purple-300/30 bg-purple-500/10 px-7 py-4 font-semibold text-purple-200 transition hover:bg-purple-500/20"
            >
              🌌 View My Galaxy
            </button>
          </div>

          {/* COUNTERS */}

          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {cats.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setFilter(cat);
                  setPage(
                    "viewGalaxy"
                  );
                }}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-purple-400/30 hover:bg-purple-500/10"
              >
                <span className="text-2xl">
                  {ico[cat]}
                </span>

                <span className="ml-2 text-white/60">
                  {cat}s
                </span>

                <p className="mt-2 text-2xl font-bold">
                  {counts[cat]}
                </p>

                <p className="mt-1 text-xs text-purple-300/70">
                  View {cat}s →
                </p>
              </button>
            ))}
          </div>

          {/* RECENT STARS */}

          <div className="mt-10">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">
                Your Stars
              </h3>

              {stars.length >
                0 && (
                <button
                  onClick={() => {
                    setFilter(
                      "All"
                    );
                    setPage(
                      "viewGalaxy"
                    );
                  }}
                  className="text-sm text-purple-300 hover:text-purple-200"
                >
                  View Galaxy →
                </button>
              )}
            </div>

            {stars.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-purple-300/30 p-12 text-center">
                <p className="text-5xl">
                  🌌
                </p>

                <h3 className="mt-4 text-2xl font-semibold">
                  Your galaxy is
                  waiting
                </h3>

                <p className="mt-2 text-white/50">
                  Create your first
                  star and make your
                  universe shine.
                </p>
              </div>
            ) : (
              <section className="mt-5 grid gap-4 md:grid-cols-2">
                {stars
                  .slice(0, 6)
                  .map((star) => (
                    <article
                      key={
                        star.id
                      }
                      className="rounded-2xl border border-purple-300/20 bg-white/5 p-5"
                    >
                      <div className="flex justify-between gap-4">
                        <div>
                          <p className="text-2xl">
                            {
                              ico[
                                star.category
                              ]
                            }
                          </p>

                          <h3 className="mt-2 text-xl font-bold">
                            {
                              star.name
                            }
                          </h3>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() =>
                              editStar(
                                star
                              )
                            }
                            className="h-fit text-sm text-purple-300 hover:text-purple-200"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              askDeleteStar(
                                star.id
                              )
                            }
                            className="h-fit text-sm text-red-300 hover:text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-white/70">
                        {
                          star.message
                        }
                      </p>

                      <p className="mt-4 text-xs text-white/40">
                        {
                          star.category
                        }{" "}
                        ·{" "}
                        {new Date(
                          star.created_at
                        ).toLocaleDateString()}
                      </p>
                    </article>
                  ))}
              </section>
            )}
          </div>

          {error && (
            <Alert text={error} />
          )}
        </main>

        {/* DELETE MODAL */}

        {deleteStarId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm">
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-purple-400/30 bg-gradient-to-br from-[#28105e] via-[#17103b] to-[#0d0827] p-7 shadow-2xl shadow-purple-950/70">
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl" />

              <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-pink-500/10 blur-3xl" />

              <div className="relative">
                <p className="text-4xl">
                  🗑️
                </p>

                <h2 className="mt-4 text-2xl font-bold">
                  Remove this star?
                </h2>

                {deleteTarget && (
                  <>
                    <p className="mt-2 text-purple-200">
                      {
                        ico[
                          deleteTarget.category
                        ]
                      }{" "}
                      {
                        deleteTarget.name
                      }
                    </p>

                    <p className="mt-3 line-clamp-3 text-sm text-white/50">
                      {
                        deleteTarget.message
                      }
                    </p>
                  </>
                )}

                <p className="mt-5 text-sm leading-6 text-white/50">
                  This star will be removed
                  from your galaxy. You
                  cannot undo this action.
                </p>

                <div className="mt-7 flex gap-3">
                  <button
                    onClick={() =>
                      setDeleteStarId(
                        null
                      )
                    }
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 font-semibold transition hover:bg-white/10"
                  >
                    Keep Star
                  </button>

                  <button
                    disabled={busy}
                    onClick={
                      confirmDeleteStar
                    }
                    className="flex-1 rounded-xl border border-red-400/20 bg-red-500/15 py-3 font-semibold text-red-200 transition hover:bg-red-500/25 disabled:opacity-50"
                  >
                    {busy
                      ? "Deleting..."
                      : "Delete Star"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  // ==================================================
  // LANDING PAGE
  // ==================================================

  return (
    <Shell nav={nav}>
      <main className="relative flex min-h-[calc(100vh-88px)] items-center justify-center overflow-hidden px-6 text-center">
        <span className="absolute left-[12%] top-[16%] animate-pulse text-3xl">
          ✨
        </span>

        <span className="absolute right-[15%] top-[25%] animate-pulse text-2xl">
          🌟
        </span>

        <span className="absolute bottom-[15%] left-[10%] text-7xl">
          🪐
        </span>

        <span className="absolute right-[8%] top-[10%] text-7xl">
          🌙
        </span>

        <section className="relative z-10 max-w-3xl">
          <p className="text-sm tracking-[0.35em] text-purple-300">
            YOUR LITTLE UNIVERSE AWAITS
          </p>

          <h2 className="mt-5 text-5xl font-bold leading-tight md:text-7xl">
            Every dream
            <br />
            deserves a{" "}
            <span className="text-purple-400">
              little star.
            </span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-white/70">
            Turn your dreams, wishes,
            goals and thoughts into
            stars in your personal
            universe.
          </p>

          <button
            onClick={() =>
              auth("signup")
            }
            className="mt-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 px-8 py-4 text-lg font-semibold shadow-lg shadow-purple-500/30 transition hover:scale-105"
          >
            ✨ Create Your Galaxy
          </button>
        </section>
      </main>
    </Shell>
  );
}

// ==================================================
// SHELL
// ==================================================

function Shell({
  children,
  nav,
}) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#07051f] text-white">
      <nav className="relative z-20 flex items-center justify-between px-6 py-6 md:px-8">
        <button
          onClick={() =>
            window.location.reload()
          }
          className="text-xl font-bold transition hover:text-purple-300 md:text-2xl"
        >
          🌌 Dream Galaxy
        </button>

        {nav}
      </nav>

      {children}

      <Analytics />
    </div>
  );
}

// ==================================================
// INPUT FIELD
// ==================================================

function Field({
  label,
  value,
  set,
  type = "text",
  placeholder,
}) {
  return (
    <label className="mt-5 block text-sm text-white/70">
      {label}

      <input
        required
        type={type}
        value={value}
        onChange={(e) =>
          set(e.target.value)
        }
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-purple-400"
      />
    </label>
  );
}

// ==================================================
// ERROR ALERT
// ==================================================

function Alert({ text }) {
  return (
    <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
      {text}
    </p>
  );
}

export default App;