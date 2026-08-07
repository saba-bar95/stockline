import { StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider, useApiToken } from "./lib/auth";
import { setApiTokenGetter } from "./lib/api";
import { PreferencesProvider } from "./preferences/PreferencesContext";
import { BusyOverlayProvider } from "./components/BusyOverlay";

function ApiTokenWire({ children }: { children: ReactNode }) {
  const getToken = useApiToken();
  useEffect(() => {
    setApiTokenGetter(getToken);
  }, [getToken]);
  return children;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <BusyOverlayProvider>
        <BrowserRouter>
          <AuthProvider>
            <ApiTokenWire>
              <App />
            </ApiTokenWire>
          </AuthProvider>
        </BrowserRouter>
      </BusyOverlayProvider>
    </PreferencesProvider>
  </StrictMode>,
);
