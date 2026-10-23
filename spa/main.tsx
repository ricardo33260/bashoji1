// Point d'entrée client-only (sans serveur) : réutilise les routes de src/routes.
import "@fontsource/noto-serif-jp/400.css";
import "@fontsource/noto-serif-jp/600.css";
import "@fontsource/zen-kaku-gothic-new/400.css";
import "@fontsource/zen-kaku-gothic-new/500.css";
import "@fontsource/zen-kaku-gothic-new/700.css";
import "../src/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { Route as IndexFile } from "../src/routes/index";
import { Route as CollectionFile } from "../src/routes/collection";

const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <Link to="/" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
        Kanji Sekai
      </Link>
    </div>
  ),
});

const indexRoute = (IndexFile as any).update({
  id: "/",
  path: "/",
  getParentRoute: () => rootRoute,
});
const collectionRoute = (CollectionFile as any).update({
  id: "/collection",
  path: "/collection",
  getParentRoute: () => rootRoute,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, collectionRoute]),
  history: createHashHistory(), // pas de serveur : navigation par #
  defaultPreloadStaleTime: 0,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
