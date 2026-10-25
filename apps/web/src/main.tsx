import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Builder } from './routes/Builder.tsx';
import { Dm } from './routes/Dm.tsx';
import { Home } from './routes/Home.tsx';
import { Settings } from './routes/Settings.tsx';
import { Table } from './routes/Table.tsx';
import './styles.css';

function Shell() {
  const { pathname } = useLocation();
  // The table view is a full-screen display with no chrome.
  if (pathname.startsWith('/table')) {
    return (
      <Routes>
        <Route path="/table" element={<Table />} />
        <Route path="/table/:combatId" element={<Table />} />
      </Routes>
    );
  }
  return (
    <div className="app">
      <nav className="topnav">
        <NavLink to="/" className="brand">⚔ Initiative</NavLink>
        <NavLink to="/" end>Combats</NavLink>
        <NavLink to="/builder">Builder</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <span className="spacer" />
        <a href="/table" target="_blank" rel="noreferrer">Open table view ↗</a>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dm/:combatId" element={<Dm />} />
        <Route path="/builder" element={<Builder />} />
        <Route path="/builder/:encounterId" element={<Builder />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  </StrictMode>,
);
