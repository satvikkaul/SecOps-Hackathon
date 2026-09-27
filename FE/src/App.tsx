import { useState } from "react";
import { Logo, Button } from "./components/ui";
import ReportChat from "./components/ReportChat";
import { useAppStore } from "./store/appStore";
import { useAuthStore } from "./store/authStore";
import { authEnabled } from "./lib/supabaseClient";
import Landing from "./screens/Landing";
import TemplateScreen from "./screens/TemplateScreen";
import ProfileScreen from "./screens/ProfileScreen";
import DomainCheck from "./screens/DomainCheck";
import Questionnaire from "./screens/Questionnaire";
import Results from "./screens/Results";
import Summary from "./screens/Summary";
import SharedSummary from "./screens/SharedSummary";
import InviteFlow from "./screens/InviteFlow";
import SignIn from "./screens/SignIn";

// ?share=<token> opens a partner's read-only view instead of the app.
const shareToken = new URLSearchParams(window.location.search).get("share");
// ?invite=<token> opens a supplier's PIN-gated check-up instead of the app.
const inviteToken = new URLSearchParams(window.location.search).get("invite");

export default function App() {
    const screen = useAppStore((s) => s.screen);
    const isDemo = useAppStore((s) => s.isDemo);
    const go = useAppStore((s) => s.go);
    const reset = useAppStore((s) => s.reset);
    const user = useAuthStore((s) => s.user);
    const authLoading = useAuthStore((s) => s.loading);
    const signOut = useAuthStore((s) => s.signOut);
    const [showSignIn, setShowSignIn] = useState(false);

    const confirmReset = () => {
        if (window.confirm("Start over? This clears all your answers."))
            reset();
    };

    if (shareToken)
        return (
            <div className="min-h-screen">
                <header className="no-print border-b border-slate-200 bg-white/90">
                    <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
                        <Logo onClick={() => window.location.assign("/")} />
                    </div>
                </header>
                <SharedSummary token={shareToken} />
            </div>
        );

    if (inviteToken)
        return (
            <div className="min-h-screen">
                <header className="no-print border-b border-slate-200 bg-white/90">
                    <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
                        <Logo onClick={() => window.location.assign("/")} />
                    </div>
                </header>
                <InviteFlow token={inviteToken} />
            </div>
        );

    return (
        <div className="min-h-screen">
            <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
                    <Logo onClick={() => go("landing")} />
                    <div className="flex items-center gap-1">
                        {isDemo && screen !== "landing" && (
                            <span className="mr-2 hidden rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 sm:inline">
                                Demo company
                            </span>
                        )}
                        {screen !== "landing" && (
                            <Button
                                variant="ghost"
                                onClick={confirmReset}
                                className="px-3 py-1.5 text-sm"
                            >
                                Start over
                            </Button>
                        )}
                        {!authLoading && authEnabled &&
                            (user ? (
                                <Button
                                    variant="ghost"
                                    onClick={() => signOut()}
                                    className="px-3 py-1.5 text-sm"
                                >
                                    Sign out
                                </Button>
                            ) : (
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowSignIn(true)}
                                    className="px-3 py-1.5 text-sm"
                                >
                                    Sign in
                                </Button>
                            ))}
                    </div>
                </div>
            </header>

            <main>
                {screen === "landing" && <Landing />}
                {screen === "template" && <TemplateScreen />}
                {screen === "profile" && <ProfileScreen />}
                {screen === "domain" && <DomainCheck />}
                {screen === "questions" && <Questionnaire />}
                {screen === "results" && (
                    <Results
                        onReset={confirmReset}
                        onSignIn={() => setShowSignIn(true)}
                        signedIn={!!user}
                    />
                )}
                {screen === "summary" && <Summary />}
            </main>

            <footer className="no-print mx-auto max-w-6xl px-6 py-10 text-center text-sm text-slate-500">
                Copyright © 2026 Chain of Custody. All rights reserved.
            </footer>

            {showSignIn && !user && (
                <div
                    className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
                    onClick={() => setShowSignIn(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="fade-in w-full max-w-md"
                    >
                        <SignIn onClose={() => setShowSignIn(false)} />
                    </div>
                </div>
            )}

            <ReportChat />
        </div>
    );
}
