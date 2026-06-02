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
  const { data, isLoading, refetch } = useQuery<{ admin: boolean }>({
    queryKey: ["/api/admin/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data?.admin) {
    return <AdminLogin onLogin={() => refetch()} />;
  }

  return <AdminPanel onLogout={() => refetch()} />;
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
