import { useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import SubmitPage from "@/pages/submit";
import AdminLogin from "@/pages/admin-login";
import AdminPanel from "@/pages/admin";
import NotFound from "@/pages/not-found";

function AdminRoute() {
  // Track login state locally so the panel shows immediately on success
  // without depending on a cookie round-trip re-check
  const [loggedIn, setLoggedIn] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ admin: boolean }>({
    queryKey: ["/api/admin/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  const isAdmin = loggedIn || data?.admin === true;

  if (isLoading && !loggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <AdminLogin onLogin={() => { setLoggedIn(true); refetch(); }} />;
  }

  return <AdminPanel onLogout={() => { setLoggedIn(false); refetch(); }} />;
}

export default function App() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={SubmitPage} />
        <Route path="/admin" component={AdminRoute} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </Router>
  );
}
