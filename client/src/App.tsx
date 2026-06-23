/* Style Reminder — App shell must preserve multi-page bilingual routing, restrained transitions, and the premium advisory brand tone. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PageTransition from "./components/PageTransition";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import React, { Suspense } from "react";

// Only Home is eagerly loaded for fastest first paint
import Home from "./pages/Home";

// All other pages are lazy-loaded for code splitting
const Solutions = React.lazy(() => import("./pages/Solutions"));
const Platform = React.lazy(() => import("./pages/Platform"));
const MindPromise = React.lazy(() => import("./pages/MindPromise"));
const MindReach = React.lazy(() => import("./pages/MindReach"));
const MindNexus = React.lazy(() => import("./pages/MindNexus"));
const Research = React.lazy(() => import("./pages/Research"));
const GeoCommunity = React.lazy(() => import("./pages/GeoCommunity"));
const About = React.lazy(() => import("./pages/About"));
const Contact = React.lazy(() => import("./pages/Contact"));
const Privacy = React.lazy(() => import("./pages/Privacy"));
const Terms = React.lazy(() => import("./pages/Terms"));
const News = React.lazy(() => import("./pages/News"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-[#3D1560] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      </div>
    </div>
  );
}

function Router() {
  return (
    <PageTransition>
      <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/">{() => <Home />}</Route>
        <Route path="/solutions">{() => <Solutions />}</Route>
        <Route path="/mindpromise">{() => <MindPromise />}</Route>
        <Route path="/mindreach">{() => <MindReach />}</Route>
        <Route path="/mindnexus">{() => <MindNexus />}</Route>
        <Route path="/products/mindpromise">{() => <MindPromise />}</Route>
        <Route path="/products/mindreach">{() => <MindReach />}</Route>
        <Route path="/products/mindnexus">{() => <MindNexus />}</Route>
        <Route path="/platform">{() => <Platform />}</Route>
        <Route path="/research/community">{() => <GeoCommunity />}</Route>
        <Route path="/research/community/*">{() => <GeoCommunity />}</Route>
        <Route path="/research">{() => <Research />}</Route>
        <Route path="/about">{() => <About />}</Route>
        <Route path="/contact">{() => <Contact />}</Route>
        <Route path="/news">{() => <News />}</Route>
        <Route path="/news/:slug">{() => <News />}</Route>
        <Route path="/news/:slug/">{() => <News />}</Route>
        <Route path="/privacy">{() => <Privacy />}</Route>
        <Route path="/terms">{() => <Terms />}</Route>
        <Route path="/404">{() => <NotFound />}</Route>
        <Route>{() => <NotFound />}</Route>
      </Switch>
      </Suspense>
    </PageTransition>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
