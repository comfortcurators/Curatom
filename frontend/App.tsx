import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Reception } from './pages/Reception';
import { Missions } from './pages/Missions';
import { Chat } from './pages/Chat';
import { Fleets } from './pages/Fleets';
import { Registry } from './pages/Registry';
import { Policies } from './pages/Policies';
import { Directory } from './pages/Directory';
import { Memory } from './pages/Memory';
import { Feed } from './pages/Feed';
import { Playground } from './pages/Playground';
import {
  PrivacyPolicy,
  AITransparency,
  HelpFAQ,
  Documentation,
  DataWeCollect,
  AboutCompany,
} from './pages/Compliance';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/reception" element={<Reception />} />
          <Route path="/" element={<Missions />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/fleets" element={<Fleets />} />
          <Route path="/registry" element={<Registry />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/ai-transparency" element={<AITransparency />} />
          <Route path="/help" element={<HelpFAQ />} />
          <Route path="/documentation" element={<Documentation />} />
          <Route path="/data-we-collect" element={<DataWeCollect />} />
          <Route path="/about" element={<AboutCompany />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;
