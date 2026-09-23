import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App.js";
import { impostaLingua, linguaIniziale, LinguaRoot } from "./i18n/index.js";
import "./styles.css";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("The page has no #root element.");
}

const root = container;

/**
 * La prima frase si scrive già nella lingua giusta: si carica prima di disegnare
 * (ADR 0044 §3). L'italiano è nella pagina, un'altra lingua è un file in più.
 */
async function avvia(): Promise<void> {
  try {
    await impostaLingua(linguaIniziale());
  } catch {
    // Il file della lingua non arriva: si parte in italiano, che è sempre qui.
  }

  createRoot(root).render(
    <StrictMode>
      <LinguaRoot>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LinguaRoot>
    </StrictMode>,
  );
}

void avvia();
