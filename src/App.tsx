import { useLayoutEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ExpensesPage } from "./pages/ExpensesPage";
import { HrPage } from "./pages/HrPage";
import { IngredientsPage } from "./pages/IngredientsPage";
import { PlPage } from "./pages/PlPage";
import { ProductionPage } from "./pages/ProductionPage";
import { ProductsPage } from "./pages/ProductsPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { RecipesPage } from "./pages/RecipesPage";
import { ResalePage } from "./pages/ResalePage";
import { SalesPage } from "./pages/SalesPage";
import { WriteOffsPage } from "./pages/WriteOffsPage";
import type { Locale } from "./i18n";
import {
  AuthPageLayout,
  OrgBootstrap,
  RequireAuth,
  SignInPage,
  SignUpPage,
  SsoCallbackPage,
} from "./lib/auth";
import { parseLocale } from "./lib/api";
import { usePrefs } from "./preferences/PreferencesContext";

function storedLocale(): Locale {
  try {
    const raw =
      localStorage.getItem("mise-prefs") || localStorage.getItem("mza-prefs");
    if (!raw) return "ka";
    const parsed = JSON.parse(raw) as { locale?: string };
    return parsed.locale === "en" ? "en" : "ka";
  } catch {
    return "ka";
  }
}

function LocaleSync({ children }: { children: ReactNode }) {
  const { locale: param } = useParams();
  const locale = parseLocale(param);
  const { locale: current, setLocale } = usePrefs();

  // Sync prefs from the URL before paint — settings/auth switches only navigate
  useLayoutEffect(() => {
    if (locale && locale !== current) setLocale(locale);
  }, [locale, current, setLocale]);

  if (!locale) return <Navigate to={`/${storedLocale()}`} replace />;
  return children;
}

const pageRoutes = (
  <>
    <Route index element={<PlPage />} />
    <Route path="ingredients" element={<IngredientsPage />} />
    <Route path="resale" element={<ResalePage />} />
    <Route path="products" element={<ProductsPage />} />
    <Route path="recipes" element={<RecipesPage />} />
    <Route path="purchases" element={<PurchasesPage />} />
    <Route path="production" element={<ProductionPage />} />
    <Route path="sales" element={<SalesPage />} />
    <Route path="write-offs" element={<WriteOffsPage />} />
    <Route path="hr" element={<HrPage />} />
    <Route path="expenses" element={<ExpensesPage />} />
  </>
);

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={`/${storedLocale()}`} replace />}
      />
      <Route
        path="/:locale"
        element={
          <LocaleSync>
            <AuthPageLayout />
          </LocaleSync>
        }
      >
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="sign-up" element={<SignUpPage />} />
      </Route>
      <Route path="/:locale/sso-callback" element={<SsoCallbackPage />} />
      <Route
        path="/:locale"
        element={
          <LocaleSync>
            <RequireAuth>
              <OrgBootstrap />
              <Layout />
            </RequireAuth>
          </LocaleSync>
        }
      >
        {pageRoutes}
      </Route>
      <Route
        path="*"
        element={<Navigate to={`/${storedLocale()}`} replace />}
      />
    </Routes>
  );
}
